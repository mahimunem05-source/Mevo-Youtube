import type { Section, Song } from "@/data/songs";
import {
  getLastPlayedTimestamp,
  getLocalLastPlayedMap,
  getLocalPlayCounts,
} from "@/services/listeningHistoryService";

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export interface FeedTrackScoreBreakdown {
  userPlayAffinity: number; // max 40 pts
  freshnessBoost: number; // +30 pts if <= 72 hours
  globalEngagement: number; // max 20 pts
  fatiguePenalty: number; // -15 pts if played in last 2h
  totalScore: number;
}

export interface RankedFeedTrack {
  song: Song;
  score: number;
  breakdown: FeedTrackScoreBreakdown;
}

export interface FeedRankingOptions {
  now?: number;
  userPlayCounts?: Record<string, number>;
  lastPlayedMap?: Record<string, number>;
}

/**
 * Calculates the exact dynamic score for a track on the Home Page feed:
 * 1. Play Count Affinity (Personal Taste): Math.min(user_play_count * 2, 40)
 * 2. Freshness / New Release Boost: +30 pts if created/uploaded within last 72 hours
 * 3. Global Engagement: Math.min((global_plays || 0) * 0.5, 20)
 * 4. Visual Anti-Staleness / Fatigue Penalty: -15 pts if played in last 2 hours
 */
export function calculateFeedTrackScore(
  track: Song,
  options: FeedRankingOptions = {},
): RankedFeedTrack {
  const now = options.now ?? Date.now();
  const userPlayCounts = options.userPlayCounts ?? getLocalPlayCounts();
  const lastPlayedMap = options.lastPlayedMap ?? getLocalLastPlayedMap();

  // 1. Play Count Affinity (Personal Taste): Math.min(user_play_count * 2, 40)
  const userPlayCount = userPlayCounts[track.id] ?? 0;
  const userPlayAffinity = Math.min(userPlayCount * 2, 40);

  // 2. Freshness / New Release Boost: +30 pts if uploaded within the last 72 hours
  const dateString = track.created_at || track.release_date;
  let isNewRelease = false;
  let createdAtTimestamp = 0;
  if (dateString) {
    const timestamp = Date.parse(dateString);
    if (!Number.isNaN(timestamp)) {
      createdAtTimestamp = timestamp;
      if (now - timestamp <= SEVENTY_TWO_HOURS_MS && now >= timestamp) {
        isNewRelease = true;
      }
    }
  }
  const freshnessBoost = isNewRelease ? 30 : 0;

  // 3. Global Engagement: Math.min((global_plays || 0) * 0.5, 20)
  const globalPlays = track.play_count ?? track.plays ?? 0;
  const globalEngagement = Math.min(Math.max(globalPlays, 0) * 0.5, 20);

  // 4. Visual Anti-Staleness / Fatigue Penalty: -15 pts if played in the last 2 hours
  const lastPlayedTime =
    lastPlayedMap[track.id] ??
    (track.last_played_at ? Date.parse(track.last_played_at) : null) ??
    getLastPlayedTimestamp(track.id);
  const isRecentlyPlayed =
    typeof lastPlayedTime === "number" &&
    !Number.isNaN(lastPlayedTime) &&
    now - lastPlayedTime <= TWO_HOURS_MS;
  const fatiguePenalty = isRecentlyPlayed ? -15 : 0;

  const totalScore = userPlayAffinity + freshnessBoost + globalEngagement + fatiguePenalty;

  return {
    song: track,
    score: totalScore,
    breakdown: {
      userPlayAffinity,
      freshnessBoost,
      globalEngagement,
      fatiguePenalty,
      totalScore,
    },
  };
}

/**
 * Horizontal In-Section Dynamic Ordering:
 * Pass section tracks through the centralized scoring formula and sort strictly by score DESC.
 * Deterministic Tie-Breaker: Sort by created_at DESC or id when scores match.
 */
export function rankSectionTracks(
  tracks: readonly Song[],
  options: FeedRankingOptions = {},
): Song[] {
  if (!tracks || tracks.length === 0) return [];

  const scoredTracks = tracks.map((track) => calculateFeedTrackScore(track, options));

  scoredTracks.sort((a, b) => {
    // 1. Total Score DESC
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    // 2. Deterministic Tie-Breaker: created_at DESC
    const dateA = a.song.created_at || a.song.release_date || "";
    const dateB = b.song.created_at || b.song.release_date || "";
    const timeA = dateA ? Date.parse(dateA) : 0;
    const timeB = dateB ? Date.parse(dateB) : 0;
    if (timeA !== timeB) {
      return timeB - timeA;
    }

    // 3. Fallback: id
    return a.song.id.localeCompare(b.song.id);
  });

  return scoredTracks.map((item) => item.song);
}

export interface SectionEngagementScore {
  section: Section;
  score: number;
  totalUserPlays: number;
  totalGlobalPlays: number;
  newReleaseCount: number;
  topTrackScoresSum: number;
}

/**
 * Calculates cumulative engagement per section:
 * Sum of user plays + global plays + presence of new releases (< 72h) + top track scores.
 */
export function calculateSectionEngagementScore(
  section: Section,
  songs: readonly Song[],
  options: FeedRankingOptions = {},
): SectionEngagementScore {
  const userPlayCounts = options.userPlayCounts ?? getLocalPlayCounts();
  const now = options.now ?? Date.now();

  let totalUserPlays = 0;
  let totalGlobalPlays = 0;
  let newReleaseCount = 0;

  const scoredSongs = songs.map((song) => {
    const userPlays = userPlayCounts[song.id] ?? 0;
    const globalPlays = song.play_count ?? song.plays ?? 0;
    totalUserPlays += userPlays;
    totalGlobalPlays += globalPlays;

    const dateString = song.created_at || song.release_date;
    if (dateString) {
      const timestamp = Date.parse(dateString);
      if (!Number.isNaN(timestamp) && now - timestamp <= SEVENTY_TWO_HOURS_MS) {
        newReleaseCount++;
      }
    }

    return calculateFeedTrackScore(song, options);
  });

  scoredSongs.sort((a, b) => b.score - a.score);
  const topTracks = scoredSongs.slice(0, 5);
  const topTrackScoresSum = topTracks.reduce((sum, item) => sum + item.score, 0);

  // Cumulative section score formula
  const score =
    totalUserPlays * 4 + totalGlobalPlays * 0.15 + newReleaseCount * 25 + topTrackScoresSum;

  return {
    section,
    score,
    totalUserPlays,
    totalGlobalPlays,
    newReleaseCount,
    topTrackScoresSum,
  };
}

export interface RankedSectionRow {
  section: Section;
  songs: Song[];
  engagementScore: number;
}

/**
 * Vertical Home Feed Section Prioritization:
 * Dynamically orders the category rows vertically so the most engaging,
 * relevant, and fresh categories appear near the top of the feed.
 */
export function rankHomeSections(
  allSections: readonly Section[],
  songsBySection: Record<string, Song[]>,
  options: FeedRankingOptions = {},
): RankedSectionRow[] {
  const scoredSections = allSections
    .map((section) => {
      const rawSongs = songsBySection[section.id] ?? [];
      const rankedSongs = rankSectionTracks(rawSongs, options);
      const engagement = calculateSectionEngagementScore(section, rankedSongs, options);

      return {
        section,
        songs: rankedSongs,
        engagementScore: engagement.score,
      };
    })
    .filter((row) => row.songs.length > 0);

  scoredSections.sort((a, b) => {
    if (b.engagementScore !== a.engagementScore) {
      return b.engagementScore - a.engagementScore;
    }
    return a.section.title.localeCompare(b.section.title);
  });

  return scoredSections;
}
