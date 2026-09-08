import { supabase } from "@/lib/supabase";
import type { Song } from "@/data/songs";

export interface ListeningHistoryRecord {
  id?: string;
  user_id?: string;
  song_id: string;
  played_at: string;
  play_duration: number;
  completed: boolean;
}

const STORAGE_PLAY_COUNTS = "mevo_song_play_counts_v1";
const STORAGE_PLAY_LOGS = "mevo_listening_history_v1";
const STORAGE_LAST_PLAYED = "mevo_last_played_timestamps_v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function isListeningActivityEnabled(): boolean {
  if (!isBrowser()) return true;
  try {
    const raw = window.localStorage.getItem("mevo-user-settings");
    if (!raw) return true;
    const settings = JSON.parse(raw) as {
      showListeningActivity?: boolean;
      privateSession?: boolean;
    };
    if (settings.privateSession === true) return false;
    if (settings.showListeningActivity === false) return false;
    return true;
  } catch {
    return true;
  }
}

export function getLocalPlayCounts(): Record<string, number> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_PLAY_COUNTS);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function setLocalPlayCounts(counts: Record<string, number>): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_PLAY_COUNTS, JSON.stringify(counts));
  } catch {
    // Ignore storage errors
  }
}

export function getLocalLastPlayedMap(): Record<string, number> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_LAST_PLAYED);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function recordSongPlayedTimestamp(songId: string, timestamp: number = Date.now()): void {
  if (!isBrowser() || !songId || !isListeningActivityEnabled()) return;
  try {
    const map = getLocalLastPlayedMap();
    map[songId] = timestamp;
    window.localStorage.setItem(STORAGE_LAST_PLAYED, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export function getLastPlayedTimestamp(songId: string): number | null {
  if (!songId) return null;
  const map = getLocalLastPlayedMap();
  if (typeof map[songId] === "number" && Number.isFinite(map[songId])) {
    return map[songId];
  }
  // Fallback to recent logs
  const logs = getLocalPlayLogs();
  const log = logs.find((l) => l.song_id === songId);
  if (log?.played_at) {
    const parsed = Date.parse(log.played_at);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

export function wasPlayedWithinMinutes(
  songId: string,
  minutes = 60,
  now: number = Date.now(),
): boolean {
  const lastPlayed = getLastPlayedTimestamp(songId);
  if (lastPlayed === null) return false;
  return now - lastPlayed <= minutes * 60 * 1000;
}

export function getLocalPlayLogs(): ListeningHistoryRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_PLAY_LOGS);
    return raw ? (JSON.parse(raw) as ListeningHistoryRecord[]) : [];
  } catch {
    return [];
  }
}

export function appendLocalPlayLog(record: ListeningHistoryRecord): void {
  if (!isBrowser()) return;
  try {
    const logs = getLocalPlayLogs();
    const updated = [record, ...logs].slice(0, 200);
    window.localStorage.setItem(STORAGE_PLAY_LOGS, JSON.stringify(updated));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clears local listening logs and play count records.
 */
export function clearListeningHistory(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_PLAY_COUNTS);
    window.localStorage.removeItem(STORAGE_PLAY_LOGS);
    window.localStorage.removeItem(STORAGE_LAST_PLAYED);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Records a played track event in listening_history table and local storage.
 */
export async function recordPlay(songId: string, duration = 0, completed = false): Promise<void> {
  if (!songId || !isListeningActivityEnabled()) return;

  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const record: ListeningHistoryRecord = {
    user_id: "anonymous-user",
    song_id: songId,
    played_at: now,
    play_duration: duration,
    completed,
  };

  // Update local play count map
  const counts = getLocalPlayCounts();
  counts[songId] = (counts[songId] ?? 0) + 1;
  setLocalPlayCounts(counts);

  // Update local last played timestamp
  recordSongPlayedTimestamp(songId, nowMs);

  // Append local log entry
  appendLocalPlayLog(record);

  // Async insert into Supabase listening_history table if available
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id || "anonymous-user";

    await supabase.from("listening_history").insert({
      user_id: userId,
      song_id: songId,
      played_at: now,
      play_duration: duration,
      completed,
    });
  } catch {
    // Graceful fallback if database table or connection is offline
  }
}

/**
 * Returns song IDs ordered descending by total play count.
 */
export function getMostPlayedSongIds(limit = 6): string[] {
  const counts = getLocalPlayCounts();
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.slice(0, limit).map(([songId]) => songId);
}

/**
 * Resolves played Song objects from catalogue ordered by play count descending,
 * breaking ties with recency from play logs and active recent session.
 */
export function getRankedPlayedSongs(
  catalogue: Song[],
  recentSongs: Song[] = [],
  limit = 100,
): { song: Song; count: number }[] {
  const counts = getLocalPlayCounts();
  const songMap = new Map(catalogue.map((s) => [s.id, s]));

  // Also include any song objects present in recentSongs if not in catalogue
  for (const s of recentSongs) {
    if (!songMap.has(s.id)) {
      songMap.set(s.id, s);
    }
  }

  const logs = getLocalPlayLogs();
  const recencyScoreMap = new Map<string, number>();

  // Most recent log gets highest recency score
  logs.forEach((log, index) => {
    if (!recencyScoreMap.has(log.song_id)) {
      recencyScoreMap.set(log.song_id, logs.length - index);
    }
  });

  // Recent songs from current session also get high recency score
  recentSongs.forEach((song, index) => {
    const currentScore = recencyScoreMap.get(song.id) ?? 0;
    const sessionScore = logs.length + (recentSongs.length - index);
    recencyScoreMap.set(song.id, Math.max(currentScore, sessionScore));
  });

  // All known played song IDs
  const playedIds = new Set<string>([
    ...Object.keys(counts).filter((id) => (counts[id] ?? 0) > 0),
    ...logs.map((l) => l.song_id),
    ...recentSongs.map((s) => s.id),
  ]);

  const items: { song: Song; count: number; recency: number }[] = [];

  for (const songId of playedIds) {
    const song = songMap.get(songId);
    if (!song) continue;

    const count = Math.max(
      counts[songId] ?? 0,
      recentSongs.some((s) => s.id === songId) ? 1 : 0,
      logs.some((l) => l.song_id === songId) ? 1 : 0,
    );
    const recency = recencyScoreMap.get(songId) ?? 0;
    items.push({ song, count, recency });
  }

  // Sort descending by play count, then by recency
  items.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return b.recency - a.recency;
  });

  return items.slice(0, limit).map(({ song, count }) => ({ song, count }));
}

/**
 * Resolves top played Song objects from catalogue ordered by play count.
 */
export function getMostPlayedSongs(
  catalogue: Song[],
  limit = 6,
  recentSongs: Song[] = [],
): { song: Song; count: number }[] {
  return getRankedPlayedSongs(catalogue, recentSongs, limit);
}
