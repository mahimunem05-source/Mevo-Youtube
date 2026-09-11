/**
 * Production-Grade Spotify/YouTube-style Two-Stage Hybrid Recommendation Engine
 * 
 * Features:
 * - Real-Time User Taste Graph with Exponential Decay
 * - Signal-weighted scoring (+5 completion, +10 favorite/playlist, +8 search play, -4 skip <15s, +3 repeat)
 * - Stage 1 Candidate Generation (40% Heavy Rotation, 30% Search Context, 30% Related Artists)
 * - Stage 2 Real-Time Hybrid Ranking (Intra-section re-sorting and dynamic Homepage section ordering)
 * - Search Entity Ingestion Pipeline
 */

import type { Song, SectionId } from "@/data/songs";
import {
  fetchYouTubeCategoryTracks,
  deduplicateYouTubeTracks,
  deduplicateCoreSongVariations,
  extractCoreSongRoot,
  isSameCoreSong,
} from "@/services/youtube";
import { playbackEvents } from "@/lib/playback-events";
import { prependTrackToSection, mergePrependedTracks } from "@/lib/category-matcher";

// ---------------------------------------------------------------------------
// Constants & Configuration
// ---------------------------------------------------------------------------
const TASTE_GRAPH_STORAGE_KEY = "mevo_user_taste_graph_v3";
const LEGACY_STORAGE_KEY_V2 = "mevo_user_taste_v2";
const LEGACY_QUICK_PICKS_KEY = "mevo_user_quick_picks";

// Half-life of 7 days for exponential decay (lambda = ln(2) / (7 * 24 hours))
const DECAY_LAMBDA_HOURLY = 0.693147 / (7 * 24);
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const MAX_SEARCH_HISTORY = 10;
const MAX_RECENT_HISTORY = 30;

export type CulturalCategory = "bangla" | "hindi" | "english" | "boost-aura" | "global";

export interface AffinityEntry {
  score: number;
  lastUpdated: number; // timestamp ms
}

export interface TrackEngagement {
  playCount: number;
  completionCount: number;
  skipCount: number;
  lastPlayed: number;
  isLiked?: boolean;
}

export interface SearchEntityRecord {
  query: string;
  artist?: string;
  genre?: string;
  culturalHint?: CulturalCategory;
  timestamp: number;
}

export interface RecentHistoryItem {
  song: Song;
  timestamp: number;
  completed?: boolean;
}

export interface UserTasteGraph {
  version: number;
  artistAffinities: Record<string, AffinityEntry>;
  culturalAffinities: Record<CulturalCategory, AffinityEntry>;
  genreAffinities: Record<string, AffinityEntry>;
  trackEngagement: Record<string, TrackEngagement>;
  recentSearchEntities: SearchEntityRecord[];
  recentHistory: RecentHistoryItem[];
  lastPlayedTrack: { song: Song; progress: number; timestamp: number } | null;
  totalPlays: number;
  totalCompletions: number;
  totalSkips: number;
  lastUpdated: number;
}

const DEFAULT_TASTE_GRAPH: UserTasteGraph = {
  version: 3,
  artistAffinities: {},
  culturalAffinities: {
    bangla: { score: 1.0, lastUpdated: Date.now() },
    hindi: { score: 1.0, lastUpdated: Date.now() },
    english: { score: 1.0, lastUpdated: Date.now() },
    "boost-aura": { score: 1.0, lastUpdated: Date.now() },
    global: { score: 1.0, lastUpdated: Date.now() },
  },
  genreAffinities: {},
  trackEngagement: {},
  recentSearchEntities: [],
  recentHistory: [],
  lastPlayedTrack: null,
  totalPlays: 0,
  totalCompletions: 0,
  totalSkips: 0,
  lastUpdated: Date.now(),
};

// ---------------------------------------------------------------------------
// Text Sanitization & Entity Extraction Helpers
// ---------------------------------------------------------------------------
export function cleanArtistName(value: string | null | undefined): string {
  if (!value) return "Unknown Artist";

  let name = value.trim();
  name = name
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\s*vevo$/i, "")
    .replace(/\s*official\s*(?:channel|music|video|audio|media|records)?$/i, "")
    .replace(/\s*records$/i, "")
    .replace(/\s*entertainment$/i, "")
    .replace(/\s*productions?$/i, "")
    .replace(/\s*tv$/i, "")
    .replace(/\s*hd$/i, "")
    .replace(/[\(\[\{].*?(?:official|audio|video|lyrics|hd|4k|remastered).*?[\)\]\}]/gi, "")
    .replace(/^[\s,_•|-]+|[\s,_•|-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return name || "Unknown Artist";
}

const BANGLA_ARTIST_KEYWORDS = [
  "anupam", "tahasan", "habib", "artcell", "warfaze", "shunno", "aurthohin",
  "minar", "arnob", "james", "ayub bachchu", "nagar baul", "lalon",
  "somnur monir konal", "imran mahmudul", "bappa mazumder", "odd signature",
  "level five", "chirkutt", "meghdol", "avoidrafa", "karnival", "conclusion",
  "shironamhin", "bengal", "bangla"
];

const HINDI_ARTIST_KEYWORDS = [
  "arijit", "pritam", "shreya ghoshal", "atif aslam", "jubin nautiyal",
  "armaan malik", "darshan raval", "neha kakkar", "badshah", "sonu nigam",
  "kk", "mohit chauhan", "ar rahman", "vishal mishra", "jasleen royal",
  "anuv jain", "zaeden", "prateek kuhad", "sanam", "bollywood", "hindi"
];

const PHONK_KEYWORDS = [
  "phonk", "drift", "brazilian phonk", "kordhell", "gxsder", "playaphonk",
  "interworld", "hensonn", "bass boosted", "drift wave", "montagem"
];

export function detectCulturalAffinity(song: Song | Partial<Song> | string): CulturalCategory {
  const text = typeof song === "string"
    ? song.toLowerCase()
    : `${song.title || ""} ${song.artist || ""} ${song.genre || ""} ${song.album || ""}`.toLowerCase();

  if (PHONK_KEYWORDS.some((kw) => text.includes(kw))) {
    return "boost-aura";
  }
  if (BANGLA_ARTIST_KEYWORDS.some((kw) => text.includes(kw)) || text.includes("bangla") || text.includes("bengali")) {
    return "bangla";
  }
  if (HINDI_ARTIST_KEYWORDS.some((kw) => text.includes(kw)) || text.includes("hindi") || text.includes("bollywood")) {
    return "hindi";
  }
  if (text.includes("english") || text.includes("pop") || text.includes("billboard") || text.includes("acoustic pop")) {
    return "english";
  }
  return "global";
}

export function extractSearchEntities(query: string): {
  artist?: string;
  genre?: string;
  culturalHint: CulturalCategory;
} {
  const lower = query.toLowerCase().trim();
  const culturalHint = detectCulturalAffinity(query);

  let detectedArtist: string | undefined;
  for (const a of [...BANGLA_ARTIST_KEYWORDS, ...HINDI_ARTIST_KEYWORDS]) {
    if (lower.includes(a) && a.length > 3) {
      detectedArtist = a.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      break;
    }
  }

  let detectedGenre: string | undefined;
  const genres = ["rock", "pop", "acoustic", "indie", "lofi", "edm", "folk", "classical", "hip hop", "phonk", "metal"];
  for (const g of genres) {
    if (lower.includes(g)) {
      detectedGenre = g.charAt(0).toUpperCase() + g.slice(1);
      break;
    }
  }

  return {
    artist: detectedArtist,
    genre: detectedGenre,
    culturalHint,
  };
}

// ---------------------------------------------------------------------------
// Real-Time Taste Graph Storage & Exponential Decay Engine
// ---------------------------------------------------------------------------
function calculateDecayedScore(entry: AffinityEntry, now: number): number {
  if (!entry || typeof entry.score !== "number") return 0;
  const deltaHours = Math.max(0, (now - entry.lastUpdated) / (1000 * 60 * 60));
  return entry.score * Math.exp(-DECAY_LAMBDA_HOURLY * deltaHours);
}

export function getUserTasteGraph(): UserTasteGraph {
  if (typeof window === "undefined") return DEFAULT_TASTE_GRAPH;
  try {
    const raw = localStorage.getItem(TASTE_GRAPH_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && parsed.version === 3) {
        return parsed as UserTasteGraph;
      }
    }

    // Auto-migrate from V2 if available
    const rawV2 = localStorage.getItem(LEGACY_STORAGE_KEY_V2);
    if (rawV2) {
      const parsedV2 = JSON.parse(rawV2);
      const graph: UserTasteGraph = {
        ...DEFAULT_TASTE_GRAPH,
        artistAffinities: Object.fromEntries(
          Object.entries(parsedV2.artistScores || {}).map(([k, v]) => [k, { score: Number(v) || 1, lastUpdated: Date.now() }])
        ),
        recentHistory: Array.isArray(parsedV2.recentHistory) ? parsedV2.recentHistory : [],
        totalPlays: parsedV2.totalSongsPlayed || 0,
        lastPlayedTrack: parsedV2.lastPlayedTrack || null,
      };
      saveUserTasteGraph(graph);
      return graph;
    }
  } catch (err) {
    console.warn("[TasteGraph] Could not parse stored taste graph:", err);
  }
  return DEFAULT_TASTE_GRAPH;
}

export function saveUserTasteGraph(graph: UserTasteGraph): void {
  if (typeof window === "undefined") return;
  try {
    graph.lastUpdated = Date.now();
    localStorage.setItem(TASTE_GRAPH_STORAGE_KEY, JSON.stringify(graph));
  } catch (err) {
    console.warn("[TasteGraph] Could not persist taste graph:", err);
  }
}

// ---------------------------------------------------------------------------
// Telemetry & Interaction Signal Ingestion Pipeline
// ---------------------------------------------------------------------------

/**
 * 1. Signal: Track Started
 * Saves the track for the "Resume Listening" capsule widget.
 * Does NOT immediately boost taste affinities to avoid instant premature bias.
 */
export function recordTrackStarted(song: Song): void {
  if (!song || !song.id) return;
  const now = Date.now();
  const graph = getUserTasteGraph();

  // Save for Resume Listening widget
  graph.lastPlayedTrack = { song, progress: 0, timestamp: now };
  saveUserTasteGraph(graph);
}

/**
 * 2. Signal: Engaged Listening (Progress >= 30s or >= 50% of track)
 * Only logs positive affinity when the user actually engages with the track.
 */
export function recordTrackProgress(song: Song, progress: number, duration: number): void {
  if (!song || !song.id) return;
  const now = Date.now();
  const graph = getUserTasteGraph();

  // Update resume progress
  graph.lastPlayedTrack = {
    song,
    progress: progress || 0,
    timestamp: now,
  };

  const isEngaged = progress >= 30 || (duration > 0 && progress / duration >= 0.5);
  const existing = (graph.trackEngagement[song.id] as (TrackEngagement & { lastEngagedAt?: number })) || {
    playCount: 0,
    completionCount: 0,
    skipCount: 0,
    lastPlayed: 0,
  };

  if (isEngaged && (!existing.lastEngagedAt || now - existing.lastEngagedAt > 60000)) {
    existing.playCount += 1;
    existing.lastPlayed = now;
    existing.lastEngagedAt = now;
    graph.trackEngagement[song.id] = existing;

    // Apply moderate +2.0 affinity boost across artist & cultural category
    applyAffinityBoost(graph, song, 2.0, now);

    // Add to recent history (debounced)
    graph.recentHistory = [
      { song, timestamp: now, completed: false },
      ...graph.recentHistory.filter((item) => item.song.id !== song.id),
    ].slice(0, MAX_RECENT_HISTORY);

    graph.totalPlays += 1;
  }

  saveUserTasteGraph(graph);
}

/**
 * 3. Signal: Track Completion (>80% duration) -> +5.0 Points
 */
export function recordTrackCompleted(song: Song): void {
  if (!song || !song.id) return;
  const now = Date.now();
  const graph = getUserTasteGraph();

  const engagement = graph.trackEngagement[song.id] || {
    playCount: 1,
    completionCount: 0,
    skipCount: 0,
    lastPlayed: now,
  };
  engagement.completionCount += 1;
  graph.trackEngagement[song.id] = engagement;
  graph.totalCompletions += 1;

  // Mark completion in recent history
  if (graph.recentHistory.length > 0 && graph.recentHistory[0].song.id === song.id) {
    graph.recentHistory[0].completed = true;
  }

  // Full +5 points boost across Artist, Cultural Vibe, and Genre
  applyAffinityBoost(graph, song, 5.0, now);
  saveUserTasteGraph(graph);
}

/**
 * 4. Signal: Liked / Added to Playlist -> +10.0 Points
 */
export function recordTrackLiked(song: Song): void {
  if (!song || !song.id) return;
  const now = Date.now();
  const graph = getUserTasteGraph();

  const engagement = graph.trackEngagement[song.id] || {
    playCount: 1,
    completionCount: 0,
    skipCount: 0,
    lastPlayed: now,
  };
  engagement.isLiked = true;
  graph.trackEngagement[song.id] = engagement;

  // Explicit +10 points signal
  applyAffinityBoost(graph, song, 10.0, now);
  saveUserTasteGraph(graph);
}

/**
 * 5. Signal: Search Interaction (Query hit & Play) -> +6.0 Points
 */
export function recordSearchInteraction(query: string, song: Song): void {
  if (!query || !song) return;
  const now = Date.now();
  const graph = getUserTasteGraph();

  const entity = extractSearchEntities(query);
  graph.recentSearchEntities = [
    {
      query: query.trim(),
      artist: entity.artist || cleanArtistName(song.artist),
      genre: entity.genre || song.genre,
      culturalHint: entity.culturalHint,
      timestamp: now,
    },
    ...graph.recentSearchEntities.filter((e) => e.query.toLowerCase() !== query.toLowerCase().trim()),
  ].slice(0, MAX_SEARCH_HISTORY);

  applyAffinityBoost(graph, song, 6.0, now);

  if (entity.artist) {
    const curArtist = graph.artistAffinities[entity.artist] || { score: 0, lastUpdated: now };
    curArtist.score = calculateDecayedScore(curArtist, now) + 6.0;
    curArtist.lastUpdated = now;
    graph.artistAffinities[entity.artist] = curArtist;
  }

  saveUserTasteGraph(graph);
}

/**
 * 6. Signal: Skipped within 15 seconds -> -4.0 Points
 */
export function recordTrackSkipped(song: Song, listenedSeconds: number): void {
  if (!song || !song.id) return;
  if (listenedSeconds > 15) return; // Only early skips penalize
  const now = Date.now();
  const graph = getUserTasteGraph();

  const engagement = graph.trackEngagement[song.id] || {
    playCount: 1,
    completionCount: 0,
    skipCount: 0,
    lastPlayed: now,
  };
  engagement.skipCount += 1;
  graph.trackEngagement[song.id] = engagement;
  graph.totalSkips += 1;

  // Penalize by -4 points
  applyAffinityBoost(graph, song, -4.0, now);
  saveUserTasteGraph(graph);
}

export function getLastPlayedTrack() {
  const graph = getUserTasteGraph();
  return graph.lastPlayedTrack;
}

export function setLastPlayedTrack(song: Song, progress = 0): void {
  recordTrackProgress(song, progress, song.duration || 0);
}

// ---------------------------------------------------------------------------
// Internal Helper: Apply Affinity Score Updates
// ---------------------------------------------------------------------------
function applyAffinityBoost(graph: UserTasteGraph, song: Song, weight: number, now: number): void {
  // 1. Artist Affinity
  const artist = cleanArtistName(song.artist);
  if (artist && artist !== "Unknown Artist") {
    const cur = graph.artistAffinities[artist] || { score: 0, lastUpdated: now };
    cur.score = Math.max(0, calculateDecayedScore(cur, now) + weight);
    cur.lastUpdated = now;
    graph.artistAffinities[artist] = cur;
  }

  // 2. Cultural Category Affinity
  const culture = detectCulturalAffinity(song);
  const curCulture = graph.culturalAffinities[culture] || { score: 1.0, lastUpdated: now };
  curCulture.score = Math.max(0.2, calculateDecayedScore(curCulture, now) + (weight * 0.8));
  curCulture.lastUpdated = now;
  graph.culturalAffinities[culture] = curCulture;

  // 3. Genre Affinity
  const genre = (song.genre || "Pop").trim();
  if (genre) {
    const curGenre = graph.genreAffinities[genre] || { score: 0, lastUpdated: now };
    curGenre.score = Math.max(0, calculateDecayedScore(curGenre, now) + (weight * 0.5));
    curGenre.lastUpdated = now;
    graph.genreAffinities[genre] = curGenre;
  }
}

// ---------------------------------------------------------------------------
// Taste Summary & Dominant Vector Inspection
// ---------------------------------------------------------------------------
export interface TasteProfileSummary {
  dominantCulture: CulturalCategory;
  dominantGenre: string;
  dominantArtists: string[];
  title: string;
  subtitle: string;
  moodBadge: string;
}

export function getTasteSummary(): TasteProfileSummary {
  const graph = getUserTasteGraph();
  const now = Date.now();

  // Top artists with decayed scores
  const artists = Object.entries(graph.artistAffinities).map(([a, entry]) => ({
    artist: a,
    score: calculateDecayedScore(entry, now),
  }));
  artists.sort((a, b) => b.score - a.score);
  const dominantArtists = artists.slice(0, 3).filter((a) => a.score >= 2.0).map((a) => a.artist);

  // Top genres with decayed scores
  const genres = Object.entries(graph.genreAffinities).map(([g, entry]) => ({
    genre: g,
    score: calculateDecayedScore(entry, now),
  }));
  genres.sort((a, b) => b.score - a.score);
  const dominantGenre = genres[0]?.genre || "Pop";

  // Calculate cultural frequency from actual history
  const cultureFrequency: Record<CulturalCategory, number> = {
    bangla: 0,
    hindi: 0,
    english: 0,
    "boost-aura": 0,
    global: 0,
  };

  for (const h of graph.recentHistory) {
    if (h.song) {
      const c = detectCulturalAffinity(h.song);
      cultureFrequency[c] = (cultureFrequency[c] || 0) + 1;
    }
  }

  for (const s of graph.recentSearchEntities) {
    if (s.culturalHint) {
      cultureFrequency[s.culturalHint] = (cultureFrequency[s.culturalHint] || 0) + 1;
    }
  }

  // Evaluate scores combining decayed affinity + explicit history weighting
  const cultures = (Object.keys(graph.culturalAffinities) as CulturalCategory[]).map((c) => {
    const affinityScore = calculateDecayedScore(graph.culturalAffinities[c], now);
    const historyBonus = (cultureFrequency[c] || 0) * 3.0;
    return {
      culture: c,
      totalScore: affinityScore + historyBonus,
      historyCount: cultureFrequency[c] || 0,
    };
  });
  cultures.sort((a, b) => b.totalScore - a.totalScore);
  const topCandidate = cultures[0];
  const dominantCulture: CulturalCategory = topCandidate?.culture || "global";

  const totalInteractions = graph.totalPlays + graph.recentSearchEntities.length;
  const isGuestOrGeneric = totalInteractions < 2 || (topCandidate && topCandidate.historyCount === 0 && topCandidate.totalScore < 4.0);

  // Default / Primary: Spotify/YouTube-style
  let title = "Quick Picks";
  let subtitle = "Songs based on your recent listening";
  let moodBadge = "Made For You";

  // Dynamic Taste Header only if user has real listening history in that vibe
  if (!isGuestOrGeneric && topCandidate && topCandidate.historyCount > 0) {
    const leadArtist = dominantArtists[0];
    if (dominantCulture === "hindi") {
      title = leadArtist ? `${leadArtist} & More` : "Bollywood Rewind";
      subtitle = leadArtist
        ? `Songs inspired by your recent listening to ${leadArtist}`
        : "Emotional Bollywood melodies and acoustic serenity";
      moodBadge = "Soft Hindi";
    } else if (dominantCulture === "bangla") {
      title = leadArtist ? `${leadArtist} & Bangla Essentials` : "Bangla Acoustic";
      subtitle = leadArtist
        ? `Songs inspired by your recent listening to ${leadArtist}`
        : "Bangla indie, rock, and acoustic essentials";
      moodBadge = "Bangla Beats";
    } else if (dominantCulture === "boost-aura") {
      title = "Phonk & Drift";
      subtitle = "High-octane bass-boosted drift phonk and aura beats";
      moodBadge = "Phonk & Drift";
    } else if (dominantCulture === "english") {
      title = leadArtist ? `${leadArtist} & Pop Essentials` : "Modern Hits & Indie";
      subtitle = leadArtist
        ? `Songs inspired by your recent listening to ${leadArtist}`
        : "English pop, chill indie, and dance anthems";
      moodBadge = "English Hits";
    } else {
      title = "Quick Picks";
      subtitle = "Songs based on your recent listening";
      moodBadge = "Made For You";
    }
  }

  return {
    dominantCulture,
    dominantGenre,
    dominantArtists,
    title,
    subtitle,
    moodBadge,
  };
}

export function getTopArtists(limit = 5): string[] {
  const graph = getUserTasteGraph();
  const now = Date.now();
  const entries = Object.entries(graph.artistAffinities).map(([artist, entry]) => ({
    artist,
    score: calculateDecayedScore(entry, now),
  }));
  entries.sort((a, b) => b.score - a.score);
  return entries.slice(0, limit).map((e) => e.artist);
}

// ---------------------------------------------------------------------------
// Stage 2: Dynamic Homepage Section Re-Ranking
// ---------------------------------------------------------------------------
export function rankCategoriesByAffinity<T extends { id: string }>(categories: T[]): T[] {
  const graph = getUserTasteGraph();
  const now = Date.now();

  const banglaScore = calculateDecayedScore(graph.culturalAffinities["bangla"], now);
  const hindiScore = calculateDecayedScore(graph.culturalAffinities["hindi"], now);
  const englishScore = calculateDecayedScore(graph.culturalAffinities["english"], now);
  const phonkScore = calculateDecayedScore(graph.culturalAffinities["boost-aura"], now);
  const globalScore = calculateDecayedScore(graph.culturalAffinities["global"], now);

  const scoreMap: Record<string, number> = {
    "mevo-pulse": globalScore + 10, // Pulse stays prominently positioned
    "bengal-echo": banglaScore * 1.5,
    "hindi-reverie": hindiScore * 1.5,
    "english-essence": englishScore * 1.4,
    "boost-aura": phonkScore * 1.6,
    "sonic-world": globalScore * 1.2,
    "mahi-select": (graph.culturalAffinities["bangla"]?.score || 1.0) + 4.0,
  };

  return [...categories].sort((a, b) => (scoreMap[b.id] || 0) - (scoreMap[a.id] || 0));
}

/**
 * Ranks tracks inside horizontal carousels based on predicted affinity
 */
export function rankTracksByAffinity(tracks: Song[]): Song[] {
  if (!tracks || tracks.length <= 1) return tracks;
  const graph = getUserTasteGraph();
  const now = Date.now();

  return [...tracks].sort((a, b) => {
    const aArtist = cleanArtistName(a.artist);
    const bArtist = cleanArtistName(b.artist);

    const aScore = (graph.artistAffinities[aArtist] ? calculateDecayedScore(graph.artistAffinities[aArtist], now) : 0) +
      (graph.trackEngagement[a.id]?.isLiked ? 15 : 0) +
      (graph.trackEngagement[a.id]?.completionCount || 0) * 2;

    const bScore = (graph.artistAffinities[bArtist] ? calculateDecayedScore(graph.artistAffinities[bArtist], now) : 0) +
      (graph.trackEngagement[b.id]?.isLiked ? 15 : 0) +
      (graph.trackEngagement[b.id]?.completionCount || 0) * 2;

    return bScore - aScore;
  });
}

// ---------------------------------------------------------------------------
// Stage 1 & 2: Spotify/YouTube-Grade "Quick Picks" / "Made For You" Engine
// Formulated as 40% Heavy Rotation / 30% Contextual Search / 30% Related Artist Graph
// ---------------------------------------------------------------------------
const NEGATIVE_SEARCH_FILTER = "-billboard -top10 -top20 -top50 -top100 -recap -countdown -ranking -compilation -shorts -tiktok -megamix";

let quickPicksCache: { data: Song[]; timestamp: number } | null = null;
let quickPicksFlight: Promise<Song[]> | null = null;

export async function fetchUserQuickPicks(targetCount = 16): Promise<Song[]> {
  if (quickPicksCache && Date.now() - quickPicksCache.timestamp < 5 * 60 * 1000) {
    return quickPicksCache.data.slice(0, targetCount);
  }

  if (quickPicksFlight) {
    return quickPicksFlight;
  }

  quickPicksFlight = (async () => {
    try {
      const graph = getUserTasteGraph();
      const summary = getTasteSummary();
      const dominantCulture = summary.dominantCulture;
      const topArtists = summary.dominantArtists;
      const currentTrackId = graph.lastPlayedTrack?.song?.id;
      const isGuest = graph.totalPlays < 2 && topArtists.length === 0 && graph.recentSearchEntities.length === 0;

      // 1. Stage 1 Candidate Generation:
      // Pool 1: Similar Artists & Related Vibe Discovery Queries (Primary Engine)
      const queriesRelated: string[] = [];

      if (isGuest) {
        queriesRelated.push(`top viral acoustic melodic hits official audio ${NEGATIVE_SEARCH_FILTER}`);
        queriesRelated.push(`latest global indie pop songs official audio ${NEGATIVE_SEARCH_FILTER}`);
      } else {
        // Targeted queries based on top artist
        if (topArtists.length > 0) {
          queriesRelated.push(`songs like "${topArtists[0]}" official audio ${NEGATIVE_SEARCH_FILTER}`);
        }

        // Vibe-specific targeted discovery query
        if (dominantCulture === "hindi") {
          queriesRelated.push(`soft hindi bollywood melodic acoustic songs official audio ${NEGATIVE_SEARCH_FILTER}`);
        } else if (dominantCulture === "bangla") {
          queriesRelated.push(`bangla indie acoustic band songs official audio ${NEGATIVE_SEARCH_FILTER}`);
        } else if (dominantCulture === "boost-aura") {
          queriesRelated.push(`drift phonk bass boosted music ${NEGATIVE_SEARCH_FILTER}`);
        } else if (dominantCulture === "english") {
          queriesRelated.push(`modern english indie pop acoustic chill official audio ${NEGATIVE_SEARCH_FILTER}`);
        } else {
          queriesRelated.push(`top viral global melodic hits official audio ${NEGATIVE_SEARCH_FILTER}`);
        }
      }

      // Pool 2: Contextual Search Intent Queries (limit to 1 top search entity)
      const queriesSearch: string[] = [];
      const recentQueries = graph.recentSearchEntities.slice(0, 1);
      for (const entity of recentQueries) {
        if (entity.artist) {
          queriesSearch.push(`songs like "${entity.artist}" official audio ${NEGATIVE_SEARCH_FILTER}`);
        } else if (entity.query) {
          queriesSearch.push(`${entity.query} songs official audio ${NEGATIVE_SEARCH_FILTER}`);
        }
      }

      // Deduplicate queries
      const uniqueRelated = [...new Set(queriesRelated)];
      const uniqueSearch = [...new Set(queriesSearch)].filter(q => !uniqueRelated.includes(q));

      // Parallel Candidate Retrieval (capped at 3 queries max)
      const fetchPromises = [
        ...uniqueRelated.slice(0, 2).map((q) => fetchYouTubeCategoryTracks(q, "relevance", 15, dominantCulture as SectionId, "Quick Picks")),
        ...uniqueSearch.slice(0, 1).map((q) => fetchYouTubeCategoryTracks(q, "viewCount", 15, dominantCulture as SectionId, "Quick Picks")),
      ];

      const results = await Promise.allSettled(fetchPromises);
      const poolRelated: Song[] = [];
      const poolSearch: Song[] = [];

      const numRelated = uniqueRelated.slice(0, 2).length;
      results.forEach((res, index) => {
        if (res.status === "fulfilled" && Array.isArray(res.value)) {
          if (index < numRelated) {
            poolRelated.push(...res.value);
          } else {
            poolSearch.push(...res.value);
          }
        }
      });

      // 2. Stage 2 Candidate Merging & Strict Vibe / Genre / Entity Consistency Control
      const finalSelection: Song[] = [];
      const seenIds = new Set<string>();
      const seenCoreTitles: string[] = [];
      const artistDistribution: Record<string, number> = {};

      function isTrackCompatibleWithTaste(song: Song): boolean {
        if (isGuest) return true;
        const songCulture = detectCulturalAffinity(song);

        // Strict Vibe Isolation
        if (dominantCulture === "boost-aura") {
          return songCulture === "boost-aura" || (song.genre || "").toLowerCase().includes("phonk") || (song.genre || "").toLowerCase().includes("electronic");
        }

        if (dominantCulture === "hindi") {
          if (songCulture === "boost-aura") return false;
          return songCulture === "hindi" || songCulture === "global";
        }

        if (dominantCulture === "bangla") {
          if (songCulture === "boost-aura") return false;
          return songCulture === "bangla" || songCulture === "global";
        }

        if (dominantCulture === "english") {
          if (songCulture === "boost-aura") return false;
          return songCulture === "english" || songCulture === "global";
        }

        return true;
      }

      function addCandidate(song: Song): boolean {
        if (!song || !song.id) return false;
        // Do NOT recommend the song the user is currently playing
        if (currentTrackId && song.id === currentTrackId) return false;
        if (seenIds.has(song.id)) return false;

        // Duration limits (60s to 480s)
        if (typeof song.duration === "number" && song.duration > 0) {
          if (song.duration < 60 || song.duration > 480) return false;
        }

        // Strict Vibe Consistency Check
        if (!isTrackCompatibleWithTaste(song)) return false;

        // Fuzzy Core Song Title Deduplication: Max 1 variation per core song in recommendations
        const songCore = extractCoreSongRoot(song.title);
        if (songCore) {
          const isDuplicateVariation = seenCoreTitles.some((existingCore) =>
            isSameCoreSong(existingCore, songCore, 0.70)
          );
          if (isDuplicateVariation) {
            return false;
          }
        }

        // Max 2 tracks per artist for high discovery diversity
        const artist = cleanArtistName(song.artist);
        if ((artistDistribution[artist] || 0) >= 2) return false;

        if (songCore) {
          seenCoreTitles.push(songCore);
        }
        seenIds.add(song.id);
        artistDistribution[artist] = (artistDistribution[artist] || 0) + 1;
        finalSelection.push(song);
        return true;
      }

      // 1. Primary Allocation: Related & Similar Discovery (70% target, ~11 tracks)
      const targetRelated = Math.round(targetCount * 0.7);
      for (const track of poolRelated) {
        if (finalSelection.length >= targetRelated) break;
        addCandidate(track);
      }

      // 2. Secondary Allocation: Search Context & Adjacent Tracks (20% target, ~3 tracks)
      const searchTargetCount = finalSelection.length + Math.round(targetCount * 0.2);
      for (const track of poolSearch) {
        if (finalSelection.length >= searchTargetCount) break;
        addCandidate(track);
      }

      // 3. Tertiary Allocation: Up to 1-2 completed tracks from history (excluding current)
      const completedHistory = graph.recentHistory
        .filter((h) => h.completed && h.song.id !== currentTrackId)
        .map((h) => h.song);
      const historyCap = Math.min(2, Math.max(0, targetCount - finalSelection.length));
      let addedFromHistory = 0;
      for (const track of completedHistory) {
        if (addedFromHistory >= historyCap) break;
        if (addCandidate(track)) {
          addedFromHistory++;
        }
      }

      // 4. Fill remaining slots from discovery pools
      for (const track of [...poolRelated, ...poolSearch]) {
        if (finalSelection.length >= targetCount) break;
        addCandidate(track);
      }

      // 5. Fallback Diverse Filling: If slots remain after variation filtering, fetch diverse regional/cultural tracks
      if (finalSelection.length < targetCount) {
        const fallbackQueries: string[] = [];
        if (dominantCulture === "hindi") {
          fallbackQueries.push(`superhit hindi acoustic melodic songs official audio ${NEGATIVE_SEARCH_FILTER}`);
          fallbackQueries.push(`best hindi unplugged romantic hits official audio ${NEGATIVE_SEARCH_FILTER}`);
        } else if (dominantCulture === "bangla") {
          fallbackQueries.push(`top bangla band acoustic songs official audio ${NEGATIVE_SEARCH_FILTER}`);
          fallbackQueries.push(`latest bangla modern indie melodies official audio ${NEGATIVE_SEARCH_FILTER}`);
        } else if (dominantCulture === "boost-aura") {
          fallbackQueries.push(`aggressive phonk drift workout music ${NEGATIVE_SEARCH_FILTER}`);
          fallbackQueries.push(`brazilian phonk montage bass boosted ${NEGATIVE_SEARCH_FILTER}`);
        } else if (dominantCulture === "english") {
          fallbackQueries.push(`top acoustic indie pop songs official audio ${NEGATIVE_SEARCH_FILTER}`);
          fallbackQueries.push(`viral english acoustic hits official audio ${NEGATIVE_SEARCH_FILTER}`);
        } else {
          fallbackQueries.push(`top viral acoustic melodic hits official audio ${NEGATIVE_SEARCH_FILTER}`);
          fallbackQueries.push(`latest global indie pop songs official audio ${NEGATIVE_SEARCH_FILTER}`);
        }

        const fallbackResults = await Promise.allSettled(
          fallbackQueries.map((q) =>
            fetchYouTubeCategoryTracks(q, "relevance", 15, dominantCulture as SectionId, "Quick Picks")
          )
        );
        for (const res of fallbackResults) {
          if (res.status === "fulfilled" && Array.isArray(res.value)) {
            for (const track of res.value) {
              if (finalSelection.length >= targetCount) break;
              addCandidate(track);
            }
          }
        }
      }

      const synthesized = deduplicateCoreSongVariations(deduplicateYouTubeTracks(finalSelection), 0.70);
      const withPrepended = mergePrependedTracks("quick-picks", synthesized);
      const finalResult = withPrepended.slice(0, targetCount);
      quickPicksCache = { data: finalResult, timestamp: Date.now() };
      quickPicksFlight = null;
      return finalResult;
    } catch (err) {
      quickPicksFlight = null;
      console.warn("[QuickPicksEngine] Synthesis error:", err);
      return [];
    }
  })();
  return quickPicksFlight;
}

export async function fetchExpandedUserQuickPicks(page = 1, limit = 20): Promise<Song[]> {
  try {
    const totalNeeded = Math.max(page * limit, 40);
    const allPicks = await fetchUserQuickPicks(totalNeeded);
    const start = (page - 1) * limit;
    return allPicks.slice(start, start + limit);
  } catch (err) {
    console.warn("[QuickPicksEngine] fetchExpandedUserQuickPicks error:", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Legacy Compatibility Helpers
// ---------------------------------------------------------------------------
export function prependToUserQuickPicks(song: Song): void {
  prependTrackToSection("quick-picks", song);
  recordSearchInteraction(song.title, song);
}

export function cleanLegacyPrependedSections(): void {
  try {
    localStorage.removeItem(LEGACY_QUICK_PICKS_KEY);
  } catch { }
}

export function startEngagementTracking(): () => void {
  return () => { };
}
