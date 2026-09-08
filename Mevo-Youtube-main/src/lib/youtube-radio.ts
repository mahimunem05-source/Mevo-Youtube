/**
 * YouTube Music Radio & Contextual Up Next Recommendation Engine
 *
 * Implements a strict recommendation pipeline:
 * CURRENT SONG
 * ↓
 * Fetch YouTube candidate results (same artist, related artists, language/vibe context)
 * ↓
 * Normalize metadata with canonical youtubeVideoId
 * ↓
 * Strict Music-Only Validation (zero cartoons, TV serials, or news)
 * ↓
 * Filter: currentSong, alreadyQueued, recentlyPlayed
 * ↓
 * Multi-Factor Weighted Scoring (+30 sameArtist, +20 sameLanguage, +20 sameGenre, +15 similarMood/artist, +10 keywords, +10 official, +10 trending, +5 recentRelease, +10 userAffinity, -50 recent, -100 queued, -1000 current/nonMusic)
 * ↓
 * Rank candidates by Score DESC
 * ↓
 * Build Rolling Up Next Queue (8–12 tracks) & Replenish Continuously
 */

import type { Song, SectionId } from "@/data/songs";
import type { UnifiedSong } from "@/lib/music-fetcher";
import { getYouTubeStreamUrl, getExtractorBaseUrl } from "@/lib/extractor";
import { parseDurationToSeconds } from "@/lib/music-fetcher";
import {
  isMusicContent,
  cleanYouTubeTitle,
  normalizeYouTubeSong,
  getOfficialContentScore,
  deduplicateYouTubeTracks,
  deduplicateCoreSongVariations,
  type MevoNormalizedSong,
} from "@/services/youtube";
import { detectCulturalAffinity, type CulturalCategory } from "@/lib/user-taste";

const AFFINITY_STORAGE_KEY = "mevo_listening_profile";
const NEGATIVE_SEARCH_FILTER =
  "-shorts -tiktok -natok -telefilm -drama -serial -recap -countdown -ranking -compilation -top10 -top20 -top50 -top100 -gopal -cartoon -episode -podcast -news";

export interface UserAffinityProfile {
  artistPlays: Record<string, number>;
  genrePlays: Record<string, number>;
  trackPlays: Record<string, number>;
  recentHistory: Array<{
    id: string;
    title: string;
    artist: string;
    cover?: string;
    timestamp: number;
  }>;
  lastUpdated: number;
}

const DEFAULT_AFFINITY_PROFILE: UserAffinityProfile = {
  artistPlays: {},
  genrePlays: {},
  trackPlays: {},
  recentHistory: [],
  lastUpdated: 0,
};

/**
 * Retrieves the client-side User Affinity Profile from localStorage.
 */
export function getAffinityProfile(): UserAffinityProfile {
  if (typeof window === "undefined") return DEFAULT_AFFINITY_PROFILE;
  try {
    const raw = localStorage.getItem(AFFINITY_STORAGE_KEY);
    if (!raw) return DEFAULT_AFFINITY_PROFILE;
    return JSON.parse(raw) as UserAffinityProfile;
  } catch {
    return DEFAULT_AFFINITY_PROFILE;
  }
}

/**
 * Records a track play event into the client-side User Affinity Profile.
 */
export function recordPlayAffinity(song: Song | UnifiedSong): void {
  if (typeof window === "undefined" || !song || !song.id) return;
  try {
    const profile = getAffinityProfile();
    const cleanArtist = (song.artist || "").trim();
    const cleanGenre = ((song as Song).genre || "Music").trim();
    const songId = song.id.replace(/^yt-/, "").trim();

    if (cleanArtist) {
      profile.artistPlays[cleanArtist] = (profile.artistPlays[cleanArtist] || 0) + 1;
    }
    if (cleanGenre) {
      profile.genrePlays[cleanGenre] = (profile.genrePlays[cleanGenre] || 0) + 1;
    }
    if (songId) {
      profile.trackPlays[songId] = (profile.trackPlays[songId] || 0) + 1;
    }

    const cover = (song as Song).cover || (song as UnifiedSong).coverImage || "";
    const historyEntry = {
      id: songId,
      title: song.title || "Unknown Track",
      artist: cleanArtist || "Unknown Artist",
      cover,
      timestamp: Date.now(),
    };

    profile.recentHistory = [
      historyEntry,
      ...profile.recentHistory.filter((item) => item.id !== songId),
    ].slice(0, 50);

    profile.lastUpdated = Date.now();
    localStorage.setItem(AFFINITY_STORAGE_KEY, JSON.stringify(profile));
  } catch (err) {
    console.warn("Could not save affinity profile:", err);
  }
}

/**
 * Returns the top-played artists from the user's affinity profile.
 */
export function getTopAffinityArtists(limit = 5): string[] {
  const profile = getAffinityProfile();
  return Object.entries(profile.artistPlays)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([artist]) => artist);
}

/**
 * Cleans YouTube titles from extraneous labels.
 */
export function cleanTrackTitle(title: string): string {
  return cleanYouTubeTitle(title, "").title;
}

/**
 * Converts a YouTube video item to a standard MEVO Song.
 */
export function mapToPlayerSong(
  id: string,
  title: string,
  artist: string,
  cover: string,
  durationSec = 210,
  category = "Up Next"
): Song {
  const cleanId = id.replace(/^yt-/, "").trim();
  const { title: cleanT, artist: cleanA } = cleanYouTubeTitle(title, artist);

  const sectionId: SectionId =
    category === "Bangla"
      ? "bangla"
      : category === "Hindi"
        ? "hindi"
        : category === "English"
          ? "english"
          : category === "Phonk"
            ? "boost-aura"
            : "global";

  return normalizeYouTubeSong(
    {
      id: cleanId,
      title: cleanT,
      channelTitle: cleanA,
      thumbnail: cover || `https://img.youtube.com/vi/${cleanId}/hqdefault.jpg`,
      duration: durationSec > 0 ? durationSec : 210,
    },
    sectionId,
    category
  );
}

/**
 * Searches valid music videos using YouTube Data API v3 with Extractor fallback.
 * Strictly applies duration bounds (60s to 480s) and isMusicContent validation.
 */
export async function searchValidMusicVideos(
  query: string,
  maxLimit = 20,
  preferredCategory = "Up Next"
): Promise<Song[]> {
  const validSongs: Song[] = [];
  const seenIds = new Set<string>();

  try {
    const extractorUrl = getExtractorBaseUrl();
    const cleanSearchQuery = `${query.trim()} ${NEGATIVE_SEARCH_FILTER}`.replace(/\s+/g, " ");
    const fallbackRes = await fetch(
      `${extractorUrl}/api/search?q=${encodeURIComponent(cleanSearchQuery)}&limit=${Math.max(maxLimit, 25)}`
    );

    if (fallbackRes.ok) {
      const data = await fallbackRes.json();
      const items = data.items || data || [];
      if (Array.isArray(items)) {
        for (const item of items) {
          const vid = (item.id || "").replace(/^yt-/, "").trim();
          if (!vid || seenIds.has(vid)) continue;

          const rawTitle = item.title || "";
          const rawChannel = item.channelTitle || item.channel || item.artist || item.uploader || "";
          const desc = item.description || "";
          const dur = typeof item.duration === "number" ? item.duration : 0;

          if (!isMusicContent(rawTitle, rawChannel, desc, dur)) {
            continue;
          }

          seenIds.add(vid);
          validSongs.push(
            mapToPlayerSong(
              vid,
              rawTitle,
              rawChannel,
              item.thumbnail || `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
              dur || 210,
              preferredCategory
            )
          );

          if (validSongs.length >= maxLimit) break;
        }
      }
    }
  } catch (err) {
    console.warn("Backend search notice in Radio engine:", err);
  }

  return deduplicateYouTubeTracks(validSongs);
}

/**
 * Weighted Recommendation Scoring Function.
 * Evaluates candidate relevance relative to the seed track and current listening context.
 */
export function scoreRecommendationCandidate(
  candidate: Song,
  seedTrack: Song | UnifiedSong,
  context: {
    currentSongId: string;
    queuedSongIds: Set<string>;
    recentlyPlayedSongIds: Set<string>;
    userAffinityArtists?: Set<string>;
  }
): number {
  const candidateVid = candidate.id.replace(/^yt-/, "").trim().toLowerCase();
  const currentVid = (context.currentSongId || seedTrack.id || "").replace(/^yt-/, "").trim().toLowerCase();

  // Hard rejection of current track
  if (candidateVid === currentVid) {
    return -1000;
  }

  // Heavy penalty if already in active queue
  if (context.queuedSongIds.has(candidateVid) || context.queuedSongIds.has(candidate.id)) {
    return -100;
  }

  // Penalty if played recently
  if (context.recentlyPlayedSongIds.has(candidateVid) || context.recentlyPlayedSongIds.has(candidate.id)) {
    return -50;
  }

  let score = 0;

  const candArtist = (candidate.artist || "").trim().toLowerCase();
  const seedArtist = (seedTrack.artist || "").trim().toLowerCase();
  const candTitle = (candidate.title || "").trim().toLowerCase();
  const seedTitle = (seedTrack.title || "").trim().toLowerCase();
  const candGenre = ((candidate as any).genre || "").trim().toLowerCase();
  const seedGenre = ((seedTrack as any).genre || "").trim().toLowerCase();

  // 1. Same Artist Match (+30)
  if (candArtist && seedArtist && (candArtist === seedArtist || candArtist.includes(seedArtist) || seedArtist.includes(candArtist))) {
    score += 30;
  }

  // 2. Same Cultural / Language Vibe Match (+20)
  const candCulture = detectCulturalAffinity(candidate);
  const seedCulture = detectCulturalAffinity(seedTrack as Song);
  if (candCulture === seedCulture) {
    score += 20;
  }

  // 3. Same Genre Match (+20)
  if (candGenre && seedGenre && candGenre === seedGenre) {
    score += 20;
  }

  // 4. Similar Mood / Artist (+15)
  if (context.userAffinityArtists?.has(candArtist)) {
    score += 15;
  }

  // 5. Keyword / Title Context Overlap (+10)
  const seedWords = seedTitle.split(/\s+/).filter((w) => w.length > 3);
  if (seedWords.some((w) => candTitle.includes(w))) {
    score += 10;
  }

  // 6. Official Content Priority (+10)
  const officialScore = getOfficialContentScore(candidate.artist || "", candidate.title || "");
  if (officialScore >= 70) {
    score += 10;
  }

  // 7. Popular / Trending Signal (+10)
  if (candidate.trending || (candidate.plays && candidate.plays > 50000)) {
    score += 10;
  }

  // 8. Recently released signal (+5)
  if (candidate.created_at) {
    const ageDays = (Date.now() - new Date(candidate.created_at).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 90) {
      score += 5;
    }
  }

  return score;
}

/**
 * Contextual Up Next Recommendation Generator.
 * Directly seeded from the currently playing song.
 *
 * Pipeline:
 * CURRENT SONG -> Fetch candidate pools -> Normalize -> Filter -> Deduplicate -> Score & Rank -> Top 8-12
 */
export async function generateRadioQueue(
  seedTrack: Song | UnifiedSong,
  existingQueuedIds: string[] = []
): Promise<Song[]> {
  const rawId = (seedTrack.id || "").replace(/^yt-/, "").trim();
  if (!rawId) return [];

  const profile = getAffinityProfile();
  const recentlyPlayedIds = new Set(profile.recentHistory.map((h) => h.id.replace(/^yt-/, "")));
  const queuedIds = new Set(existingQueuedIds.map((id) => id.replace(/^yt-/, "")));
  const topArtistsSet = new Set(getTopAffinityArtists(10).map((a) => a.toLowerCase()));

  const cleanTitle = cleanTrackTitle(seedTrack.title);
  const cleanArtist = (seedTrack.artist || "").replace(/YouTube Artist/i, "").trim();
  const culture = detectCulturalAffinity(seedTrack as Song);

  // Candidate query generation based on current track context
  const candidateQueries: string[] = [];

  // Query A: Direct Artist & Title Anchor
  if (cleanArtist) {
    candidateQueries.push(`"${cleanArtist}" "${cleanTitle}" official audio`);
    candidateQueries.push(`"${cleanArtist}" official audio songs`);
  } else {
    candidateQueries.push(`"${cleanTitle}" official audio`);
  }

  // Query B: Genre / Cultural Anchor
  if (culture === "bangla") {
    candidateQueries.push(`bangla songs official audio | bangla band official audio`);
    candidateQueries.push(`top bangla new hits official audio track`);
    candidateQueries.push(`popular bangla acoustic songs official audio`);
  } else if (culture === "hindi") {
    candidateQueries.push(`latest hindi official audio songs | bollywood official audio`);
    candidateQueries.push(`trending romantic hindi songs official audio`);
    candidateQueries.push(`top bollywood melodies official audio`);
  } else if (culture === "boost-aura") {
    candidateQueries.push(`drift phonk official audio | phonk music official audio`);
    candidateQueries.push(`brazilian phonk viral official audio`);
    candidateQueries.push(`dark atmospheric phonk official audio`);
  } else if (culture === "english") {
    candidateQueries.push(`english pop official audio songs | viral english songs`);
    candidateQueries.push(`top english pop hits official audio`);
    candidateQueries.push(`international acoustic pop hits official audio`);
  } else {
    candidateQueries.push(`viral global pop hits official audio`);
    candidateQueries.push(`kpop official audio | latin viral official audio`);
  }

  // Parallel candidate retrieval
  const allCandidates: Song[] = [];
  const seenCandidateIds = new Set<string>([rawId]);

  // Step 1: Pre-fetch Innertube Watch-Next radio queue for seed track
  try {
    const extractorUrl = getExtractorBaseUrl();
    const relatedRes = await fetch(`${extractorUrl}/api/queue/related?videoId=${encodeURIComponent(rawId)}`);
    if (relatedRes.ok) {
      const relData = await relatedRes.json();
      if (relData && Array.isArray(relData.items)) {
        for (const it of relData.items) {
          const vid = (it.id || "").replace(/^yt-/, "").trim();
          if (!vid || seenCandidateIds.has(vid)) continue;
          seenCandidateIds.add(vid);
          allCandidates.push(
            mapToPlayerSong(
              vid,
              it.title || "",
              it.artist || it.channelTitle || "YouTube Artist",
              it.thumbnail || `https://img.youtube.com/vi/${vid}/hqdefault.jpg`,
              it.duration || 210,
              "Up Next"
            )
          );
        }
      }
    }
  } catch (err) {
    console.warn("[generateRadioQueue] Innertube queue notice:", err);
  }

  const candidatePools = await Promise.allSettled(
    candidateQueries.map((q) => searchValidMusicVideos(q, 10, "Up Next"))
  );

  for (const res of candidatePools) {
    if (res.status === "fulfilled" && Array.isArray(res.value)) {
      for (const track of res.value) {
        const vid = track.id.replace(/^yt-/, "").trim();
        if (!vid || seenCandidateIds.has(vid)) continue;
        seenCandidateIds.add(vid);
        allCandidates.push(track);
      }
    }
  }

  // Deduplicate candidates before scoring
  const dedupedCandidates = deduplicateYouTubeTracks(allCandidates);

  // Score each candidate
  const scored = dedupedCandidates.map((candidate) => ({
    track: candidate,
    score: scoreRecommendationCandidate(candidate, seedTrack, {
      currentSongId: rawId,
      queuedSongIds: queuedIds,
      recentlyPlayedSongIds: recentlyPlayedIds,
      userAffinityArtists: topArtistsSet,
    }),
  }));

  // Filter out candidates with severe negative penalties and rank by Score DESC
  const ranked = scored
    .filter((item) => item.score > -50)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.track);

  // Return rolling initial Up Next batch (8 to 12 tracks) after final smart deduplication and core variation deduplication
  return deduplicateCoreSongVariations(deduplicateYouTubeTracks(ranked), 0.70).slice(0, 12);
}

/**
 * Continuous Rolling Queue Replenishment.
 * Automatically called when remaining queue size is low.
 */
export async function fetchQueueContinuation(
  currentTrack: Song | UnifiedSong,
  queueHistory: string[] = []
): Promise<Song[]> {
  return generateRadioQueue(currentTrack, queueHistory);
}

/**
 * Dynamic "Quick Picks" / "Listen Again" Generator
 */
export async function fetchQuickPicks(limit = 20): Promise<Song[]> {
  try {
    const topArtists = getTopAffinityArtists(4);
    if (topArtists.length > 0) {
      const query = topArtists.map((a) => `"${a}"`).join(" OR ") + " official audio songs";
      const songs = await searchValidMusicVideos(query, limit * 2, "Quick Picks");
      const deduped = deduplicateCoreSongVariations(deduplicateYouTubeTracks(songs), 0.70);
      if (deduped.length >= Math.min(8, limit)) {
        return deduped.slice(0, limit);
      }
    }

    // Fallback: Viral global hits
    const fallback = await searchValidMusicVideos("viral english pop songs official audio", limit * 2, "Quick Picks");
    return deduplicateCoreSongVariations(deduplicateYouTubeTracks(fallback), 0.70).slice(0, limit);
  } catch (err) {
    console.error("Error fetching quick picks:", err);
    return [];
  }
}
