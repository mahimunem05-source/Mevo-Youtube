/**
 * Shared types for the Local-First Anonymous Hybrid Ranking system.
 *
 * The ranking engine never touches UI: it only takes song-shaped objects and
 * returns them re-ordered, so every section/page can reuse one calculation.
 */

export interface EngagementSignals {
  /** Plays that passed the valid-play rule (30s OR 50% of duration). */
  validPlays: number;
  /** Valid plays in the last 7 days. */
  recentValidPlays: number;
  /** Plays where the listener reached the end of the track. */
  completedPlays: number;
  /** Sessions that abandoned the track before the valid-play threshold. */
  skips: number;
  /** Valid plays by a session that had already played the song before. */
  repeatPlays: number;
  /** Total listening time across all sessions. */
  totalListenedSeconds: number;
  /** Unique anonymous session estimate. */
  uniqueSessions: number;
  /** Timestamp (ms) of the most recent recorded event, or null. */
  lastPlayAt: number | null;
}

export const EMPTY_ENGAGEMENT: EngagementSignals = {
  validPlays: 0,
  recentValidPlays: 0,
  completedPlays: 0,
  skips: 0,
  repeatPlays: 0,
  totalListenedSeconds: 0,
  uniqueSessions: 0,
  lastPlayAt: null,
};

/** Everything the ranking engine needs to know about one song. */
export interface RankingSignals {
  id: string;
  /** Actual publication timestamp (ms). Never reset by metadata edits. */
  publishedAt: number;
  duration: number;
  playCount: number;
  published: boolean;
  /** Admin controls — always outside the algorithm and highest priority. */
  adminExcluded: boolean;
  adminPinnedPosition: number | null;
  adminManualOrder: number | null;
  adminBoost: number;
  engagement: EngagementSignals;
}

/** Minimal shape a rankable item must expose for local personalisation. */
export interface RankableSong {
  id: string;
  artist?: string | null;
  genre?: string | null;
  album?: string | null;
  section?: string | null;
}

/** Anonymous, device-local listening profile (localStorage only). */
export interface LocalPreferenceProfile {
  artists: Record<string, number>;
  genres: Record<string, number>;
  sections: Record<string, number>;
  albums: Record<string, number>;
  updatedAt: number;
}

export const EMPTY_PREFERENCE_PROFILE: LocalPreferenceProfile = {
  artists: {},
  genres: {},
  sections: {},
  albums: {},
  updatedAt: 0,
};
