/**
 * Anonymous session identity + client-side duplicate-event protection.
 *
 * The id is a random opaque string kept in localStorage. It is never linked to
 * an account and carries no personal data — it only lets the backend estimate
 * unique listeners and reject replay/refresh spam.
 */

const SESSION_STORAGE_KEY = "mevo-anon-session-v1";
const RECENT_EVENTS_KEY = "mevo-anon-recent-events-v1";
const PLAYED_SONGS_KEY = "mevo-anon-played-songs-v1";

/** One stored event per song per hour, mirroring the database unique index. */
export const EVENT_DEDUPE_WINDOW_MS = 60 * 60 * 1000;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** Stable per-device/browser id. Falls back to a memory-only id. */
let memorySessionId: string | null = null;

export function getAnonymousSessionId(): string {
  if (!isBrowser()) {
    memorySessionId ??= randomId();
    return memorySessionId;
  }

  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing && existing.length >= 8 && existing.length <= 64) {
      return existing;
    }

    const created = randomId();
    window.localStorage.setItem(SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    memorySessionId ??= randomId();
    return memorySessionId;
  }
}

function readMap(key: string): Record<string, number> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed)) {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) result[id] = numeric;
    }
    return result;
  } catch {
    return {};
  }
}

function writeMap(key: string, value: Record<string, number>): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/** In-memory guard so a burst of events in one tab never double-writes. */
const inFlight = new Map<string, number>();

/**
 * True when an event for this song was already accepted inside the current
 * dedupe window (covers refresh spam, replay spam and duplicate emissions).
 */
export function isDuplicateEvent(songId: string, now = Date.now()): boolean {
  const memoryStamp = inFlight.get(songId);
  if (memoryStamp && now - memoryStamp < EVENT_DEDUPE_WINDOW_MS) return true;

  const stored = readMap(RECENT_EVENTS_KEY);
  const stamp = stored[songId];
  return Boolean(stamp && now - stamp < EVENT_DEDUPE_WINDOW_MS);
}

export function markEventRecorded(songId: string, now = Date.now()): void {
  inFlight.set(songId, now);

  const stored = readMap(RECENT_EVENTS_KEY);
  stored[songId] = now;

  for (const [id, stamp] of Object.entries(stored)) {
    if (now - stamp > EVENT_DEDUPE_WINDOW_MS * 24) delete stored[id];
  }

  writeMap(RECENT_EVENTS_KEY, stored);
}

/** Repeat listening = this session already had a valid play of the song. */
export function hasPlayedBefore(songId: string): boolean {
  return Boolean(readMap(PLAYED_SONGS_KEY)[songId]);
}

export function markPlayed(songId: string, now = Date.now()): void {
  const stored = readMap(PLAYED_SONGS_KEY);
  stored[songId] = now;
  writeMap(PLAYED_SONGS_KEY, stored);
}
