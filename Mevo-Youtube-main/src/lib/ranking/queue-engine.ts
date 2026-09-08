import type { NavigationSource, QueueSource, Song } from "@/data/songs";
import {
  getLastPlayedTimestamp,
  getLocalLastPlayedMap,
  getLocalPlayCounts,
} from "@/services/listeningHistoryService";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000; // 72 hours
const SIXTY_MINUTES_MS = 60 * 60 * 1000;

export interface TrackScoreBreakdown {
  affinityScore: number;
  artistContinuityScore: number;
  newReleaseScore: number;
  fatiguePenaltyScore: number;
  totalScore: number;
}

export interface SmartScoredSong {
  song: Song;
  score: number;
  breakdown: TrackScoreBreakdown;
}

export interface CalculateScoreOptions {
  now?: number;
  playCounts?: Record<string, number>;
  lastPlayedMap?: Record<string, number>;
}

/**
 * Calculates the exact 4-factor Spotify/Apple Music-grade dynamic score for a candidate track
 * in relation to the active currently-playing track.
 *
 * Scoring Formula:
 * 1. User Play Affinity: Math.min(play_count * 2.5, 25)
 * 2. Artist Continuity: +20 points if candidate artist matches current track artist
 * 3. New Release Boost: +15 points if uploaded within the last 3 days (created_at / release_date)
 * 4. Anti-Repetition / Fatigue Penalty: -30 points if played within the last 60 minutes
 */
export function calculateTrackScore(
  candidate: Song,
  currentTrack: Song,
  options: CalculateScoreOptions = {},
): SmartScoredSong {
  const now = options.now ?? Date.now();
  const playCounts = options.playCounts ?? getLocalPlayCounts();
  const lastPlayedMap = options.lastPlayedMap ?? getLocalLastPlayedMap();

  // 1. User Play Affinity: Math.min(play_count * 2.5, 25)
  const effectivePlayCount = Math.max(
    candidate.play_count ?? 0,
    candidate.plays ?? 0,
    playCounts[candidate.id] ?? 0,
  );
  const affinityScore = Math.min(effectivePlayCount * 2.5, 25);

  // 2. Artist Continuity: +20 points if track artist matches current track artist
  const candidateArtist = candidate.artist?.trim().toLowerCase() ?? "";
  const currentArtist = currentTrack.artist?.trim().toLowerCase() ?? "";
  const isSameArtist =
    candidateArtist.length > 0 && currentArtist.length > 0 && candidateArtist === currentArtist;
  const artistContinuityScore = isSameArtist ? 20 : 0;

  // 3. New Release Boost: +15 points if uploaded within the last 3 days (created_at or release_date)
  const dateString = candidate.created_at || candidate.release_date;
  let isNewRelease = false;
  if (dateString) {
    const timestamp = Date.parse(dateString);
    if (!Number.isNaN(timestamp) && now - timestamp <= THREE_DAYS_MS && now >= timestamp) {
      isNewRelease = true;
    }
  }
  const newReleaseScore = isNewRelease ? 15 : 0;

  // 4. Anti-Repetition / Fatigue Penalty: -30 points if track was played within the last 60 minutes
  const lastPlayedTime =
    lastPlayedMap[candidate.id] ??
    (candidate.last_played_at ? Date.parse(candidate.last_played_at) : null) ??
    getLastPlayedTimestamp(candidate.id);
  const isRecentlyPlayed =
    typeof lastPlayedTime === "number" &&
    !Number.isNaN(lastPlayedTime) &&
    now - lastPlayedTime <= SIXTY_MINUTES_MS;
  const fatiguePenaltyScore = isRecentlyPlayed ? -30 : 0;

  const totalScore = affinityScore + artistContinuityScore + newReleaseScore + fatiguePenaltyScore;

  return {
    song: candidate,
    score: totalScore,
    breakdown: {
      affinityScore,
      artistContinuityScore,
      newReleaseScore,
      fatiguePenaltyScore,
      totalScore,
    },
  };
}

export interface UniversalSmartQueueParams {
  currentTrack: Song;
  contextSongs?: Song[];
  catalogue: Song[];
  queueSource?: QueueSource | null;
  navigationSource?: NavigationSource | null;
  now?: number;
}

export interface UniversalSmartQueueResult {
  queue: Song[];
  originalQueue: Song[];
  currentIndex: number;
  queueSource: QueueSource;
  navigationSource: NavigationSource;
}

/**
 * Universally generates the active queue for MEVO when any song is clicked/played from ANY section.
 * - Establishes the active playback context (`PLAYING FROM <SectionName>`).
 * - Current track is positioned at index 0 (active).
 * - Dynamically generates "UP NEXT" by sorting the remaining tracks of that active section
 *   strictly by `score DESC` using the weighted formula.
 */
export function createUniversalSmartQueue(
  params: UniversalSmartQueueParams,
): UniversalSmartQueueResult {
  const { currentTrack, contextSongs, catalogue, queueSource, navigationSource, now } = params;

  // Deduplicate context songs
  const seenIds = new Set<string>();
  const rawContext = (
    contextSongs && contextSongs.length > 0 ? contextSongs : [currentTrack]
  ).filter((song) => {
    if (!song?.id || seenIds.has(song.id)) return false;
    seenIds.add(song.id);
    return true;
  });

  // Pull candidate remaining songs from the active section (excluding currentTrack)
  const remainingSectionSongs = rawContext.filter((song) => song.id !== currentTrack.id);

  const playCounts = getLocalPlayCounts();
  const lastPlayedMap = getLocalLastPlayedMap();
  const scoreOptions: CalculateScoreOptions = { now, playCounts, lastPlayedMap };

  // Score all remaining section tracks
  const scoredRemaining = remainingSectionSongs.map((candidate) =>
    calculateTrackScore(candidate, currentTrack, scoreOptions),
  );

  // Sort remaining section songs strictly by score DESC (tie-break deterministically)
  scoredRemaining.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.song.title.localeCompare(b.song.title);
  });

  const rankedRemainingSongs = scoredRemaining.map((item) => item.song);

  // The primary queue consists of [currentTrack, ...rankedRemainingSectionSongs]
  const queue = [currentTrack, ...rankedRemainingSongs];

  // Resolve queue source & context title
  const resolvedSource: QueueSource = queueSource ?? {
    type: "section",
    id: currentTrack.section,
    title: currentTrack.category || "Section",
  };

  const resolvedNavSource: NavigationSource = navigationSource ?? {
    ...resolvedSource,
    pathname: "/",
    label: resolvedSource.title,
  };

  return {
    queue,
    originalQueue: queue,
    currentIndex: 0,
    queueSource: resolvedSource,
    navigationSource: resolvedNavSource,
  };
}

/**
 * Infinite Autoplay Fallback (Cross-Section Discovery):
 * When all songs from the active section finish (or when reaching the end of queue),
 * dynamically resolves discovery tracks from other sections / global library matching
 * the current track's genre / category / language / artist.
 */
export function generateDiscoveryQueue(
  currentTrack: Song | null,
  existingQueue: Song[],
  catalogue: Song[],
  limit = 20,
  options: CalculateScoreOptions = {},
): Song[] {
  if (!currentTrack || catalogue.length === 0) return [];

  const existingIds = new Set(existingQueue.map((song) => song.id));
  existingIds.add(currentTrack.id);

  // Available candidates across the entire global library not already in the active queue
  const candidates = catalogue.filter((song) => !existingIds.has(song.id));
  if (candidates.length === 0) return [];

  const now = options.now ?? Date.now();
  const playCounts = options.playCounts ?? getLocalPlayCounts();
  const lastPlayedMap = options.lastPlayedMap ?? getLocalLastPlayedMap();
  const scoreOptions: CalculateScoreOptions = { now, playCounts, lastPlayedMap };

  const currentArtist = currentTrack.artist?.trim().toLowerCase() ?? "";
  const currentAlbum = currentTrack.album?.trim().toLowerCase() ?? "";
  const currentGenre = currentTrack.genre?.trim().toLowerCase() ?? "";
  const currentSection = currentTrack.section;
  const currentCategory = currentTrack.category?.trim().toLowerCase() ?? "";

  // Score candidates with cross-section relevance boost + smart formula
  const scoredCandidates = candidates.map((candidate) => {
    const baseScore = calculateTrackScore(candidate, currentTrack, scoreOptions);

    let relevanceBoost = 0;
    const candArtist = candidate.artist?.trim().toLowerCase() ?? "";
    const candAlbum = candidate.album?.trim().toLowerCase() ?? "";
    const candGenre = candidate.genre?.trim().toLowerCase() ?? "";
    const candCategory = candidate.category?.trim().toLowerCase() ?? "";

    if (candArtist && candArtist === currentArtist) {
      relevanceBoost += 40;
    }
    if (candAlbum && candAlbum !== "singles" && candAlbum === currentAlbum) {
      relevanceBoost += 30;
    }
    if (candGenre && candGenre !== "unknown" && candGenre === currentGenre) {
      relevanceBoost += 25;
    }
    if (
      (candidate.section && candidate.section === currentSection) ||
      (candCategory && candCategory === currentCategory)
    ) {
      relevanceBoost += 15;
    }

    return {
      song: candidate,
      totalScore: baseScore.score + relevanceBoost,
    };
  });

  // Sort discovery candidates by total score DESC
  scoredCandidates.sort((a, b) => {
    if (b.totalScore !== a.totalScore) {
      return b.totalScore - a.totalScore;
    }
    return a.song.title.localeCompare(b.song.title);
  });

  return scoredCandidates.slice(0, limit).map((item) => item.song);
}
