import { supabase } from "@/lib/supabase";
import {
  getAnonymousSessionId,
  isDuplicateEvent,
  markEventRecorded,
  hasPlayedBefore,
  markPlayed,
} from "./anonymous-session";

// ---------------------------------------------------------------------------
// Types matched to actual DB migration schema
// ---------------------------------------------------------------------------

/** Matches the actual `song_engagement` table columns from the DB migration. */
interface EngagementRow {
  song_id: string;
  valid_plays: number;
  recent_valid_plays: number;
  completed_plays: number;
  skips: number;
  repeat_plays: number;
  total_listened_seconds: number;
  unique_sessions: number;
  last_play_at: string | null;
  updated_at: string;
}

interface SongSignalRow {
  id: string;
  duration: number | null;
  play_count: number | null;
  published: boolean | null;
  created_at: string | null;
  admin_pinned_position?: number | null;
  admin_manual_order?: number | null;
  admin_boost?: number | null;
  admin_excluded?: boolean | null;
}

// ---------------------------------------------------------------------------
// Re-exported types (consumed by ranking-engine / use-ranking)
// ---------------------------------------------------------------------------

export interface EngagementStats {
  validPlays: number;
  recentValidPlays: number;
  completedPlays: number;
  skips: number;
  repeatPlays: number;
  totalListenedSeconds: number;
  uniqueSessions: number;
  lastPlayAt: number | null;
}

export interface RankingSignals {
  id: string;
  publishedAt: number;
  duration: number;
  playCount: number;
  published: boolean;
  adminExcluded: boolean;
  adminPinnedPosition: number | null;
  adminManualOrder: number | null;
  adminBoost: number;
  engagement: EngagementStats;
}

export const EMPTY_ENGAGEMENT: EngagementStats = {
  validPlays: 0,
  recentValidPlays: 0,
  completedPlays: 0,
  skips: 0,
  repeatPlays: 0,
  totalListenedSeconds: 0,
  uniqueSessions: 0,
  lastPlayAt: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isValidPlay(listenedSeconds: number, durationSeconds: number): boolean {
  if (listenedSeconds >= 30) return true;
  if (durationSeconds > 0 && listenedSeconds / durationSeconds >= 0.5) return true;
  return false;
}

// ---------------------------------------------------------------------------
// getRankingSignals — reads song rows + engagement summary
// ---------------------------------------------------------------------------

/**
 * Loads the ranking signal map for the whole catalogue.
 * Reads from `songs` for base metadata and from `song_engagement` for the
 * aggregated play stats (maintained by a DB trigger on `song_play_events`).
 * Any failure degrades gracefully to an empty map.
 */
export async function getRankingSignals(): Promise<Map<string, RankingSignals>> {
  const signals = new Map<string, RankingSignals>();

  try {
    // 1. Load base song data
    let songsData: SongSignalRow[] | null = null;

    const fullSelect = await supabase
      .from("songs")
      .select("id, duration, play_count, published, created_at");

    if (fullSelect.error) {
      console.warn("Ranking: song select failed, trying minimal columns", fullSelect.error.message);
      const basicSelect = await supabase
        .from("songs")
        .select("id, duration, play_count, published");
      songsData = basicSelect.data as SongSignalRow[] | null;
    } else {
      songsData = fullSelect.data as SongSignalRow[] | null;
    }

    // 2. Load engagement summary — maintained by DB triggers from song_play_events.
    //    Silently degrade if the table is missing or has no rows.
    const engagementById = new Map<string, EngagementRow>();
    try {
      const { data: engData, error: engError } = await supabase
        .from("song_engagement")
        .select(
          "song_id, valid_plays, recent_valid_plays, completed_plays, skips, repeat_plays, total_listened_seconds, unique_sessions, last_play_at",
        );

      if (!engError && engData) {
        for (const row of engData as EngagementRow[]) {
          engagementById.set(String(row.song_id), row);
        }
      }
    } catch {
      // Engagement table not present — degrade to zero signals.
    }

    // 3. Build signal map
    if (songsData) {
      for (const row of songsData) {
        const id = String(row.id);
        const eng = engagementById.get(id);

        signals.set(id, {
          id,
          publishedAt: toTimestamp(row.created_at) ?? 0,
          duration: Number(row.duration ?? 0),
          playCount: Number(row.play_count ?? 0),
          published: row.published !== false,
          adminExcluded: row.admin_excluded === true,
          adminPinnedPosition:
            row.admin_pinned_position == null ? null : Number(row.admin_pinned_position),
          adminManualOrder: row.admin_manual_order == null ? null : Number(row.admin_manual_order),
          adminBoost: Number(row.admin_boost ?? 0),
          engagement: {
            validPlays: Number(eng?.valid_plays ?? 0),
            recentValidPlays: Number(eng?.recent_valid_plays ?? 0),
            completedPlays: Number(eng?.completed_plays ?? 0),
            skips: Number(eng?.skips ?? 0),
            repeatPlays: Number(eng?.repeat_plays ?? 0),
            totalListenedSeconds: Number(eng?.total_listened_seconds ?? 0),
            uniqueSessions: Number(eng?.unique_sessions ?? 0),
            lastPlayAt: eng?.last_play_at ? toTimestamp(eng.last_play_at) : null,
          },
        });
      }
    }
  } catch (err) {
    console.error("Ranking: signals loading failed", err);
  }

  return signals;
}

// ---------------------------------------------------------------------------
// recordPlaybackObservation — writes a raw play event to song_play_events
// ---------------------------------------------------------------------------

/**
 * Records a raw playback observation to `song_play_events`.
 * The DB trigger `song_play_events_aggregate` automatically refreshes the
 * `song_engagement` materialized summary — never write to `song_engagement` directly.
 *
 * Accepts either an options object (new tracker) or positional args (legacy).
 */
export async function recordPlaybackObservation(options: {
  songId: string;
  listenedSeconds: number;
  duration: number;
  completed: boolean;
}): Promise<void>;
export async function recordPlaybackObservation(
  songId: string,
  listenedSeconds: number,
  completed: boolean,
): Promise<void>;
export async function recordPlaybackObservation(
  songIdOrOptions:
    string | { songId: string; listenedSeconds: number; duration: number; completed: boolean },
  listenedSecondsArg?: number,
  completedArg?: boolean,
): Promise<void> {
  let songId: string;
  let listenedSeconds: number;
  let duration: number;
  let completed: boolean;

  if (typeof songIdOrOptions === "object") {
    songId = songIdOrOptions.songId;
    listenedSeconds = songIdOrOptions.listenedSeconds;
    duration = songIdOrOptions.duration;
    completed = songIdOrOptions.completed;
  } else {
    songId = songIdOrOptions;
    listenedSeconds = listenedSecondsArg ?? 0;
    duration = 0;
    completed = completedArg ?? false;
  }

  try {
    if (!songId) return;

    const sessionId = getAnonymousSessionId();
    const now = Date.now();

    // Client-side dedupe — mirrors the DB unique index (song_id, session_id, event_bucket).
    if (isDuplicateEvent(songId, now)) return;

    const isRepeat = hasPlayedBefore(songId);
    const isValidPlayed = isValidPlay(listenedSeconds, duration);
    const isSkip = !isValidPlayed;

    // Round down to the current hour boundary — matches the DB event_bucket field.
    const hourBucket = new Date(
      Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000),
    ).toISOString();

    const { error } = await supabase.from("song_play_events").insert({
      song_id: songId,
      session_id: sessionId,
      listened_seconds: Math.round(listenedSeconds),
      song_duration: Math.round(duration),
      completed,
      is_valid_play: isValidPlayed,
      is_skip: isSkip,
      is_repeat: isRepeat,
      event_bucket: hourBucket,
    });

    if (error) {
      // 23505 = unique_violation (dedup index) — expected and harmless.
      if (error.code === "23505") return;
      console.warn("Ranking: play event insert failed", error.message);
      return;
    }

    markEventRecorded(songId, now);
    if (isValidPlayed) markPlayed(songId, now);
  } catch (err) {
    console.warn("Ranking: failed to record play observation", err);
  }
}

// ---------------------------------------------------------------------------
// recordPlaySignal — kept for any legacy imports
// ---------------------------------------------------------------------------

/** @deprecated Use recordPlaybackObservation instead. */
export async function recordPlaySignal(
  songId: string,
  listenedSeconds: number,
  completed: boolean,
): Promise<void> {
  return recordPlaybackObservation(songId, listenedSeconds, completed);
}
