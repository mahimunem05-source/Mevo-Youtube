/**
 * Engagement tracker.
 *
 * Listens to the existing playback event bus (no UI, no player redesign) and
 * turns raw playback into validated ranking signals:
 *
 *   - accumulates *actual* listening time (seek jumps are ignored)
 *   - a listen becomes a valid play at 30s or 50% of the song, whichever first
 *   - anything shorter is stored as a skip
 *   - one stored event per song per anonymous session per hour
 *   - valid plays also update the device-local anonymous taste profile
 */

import { playbackEvents } from "@/lib/playback-events";
import { recordLocalPreference } from "./local-preferences";
import { isValidPlay, recordPlaybackObservation } from "./engagement-service";
import type { RankableSong } from "./types";

/** Ignore forward jumps larger than this — they are seeks, not listening. */
const MAX_TICK_SECONDS = 2.5;

interface TrackedSpan {
  song: RankableSong & { duration?: number };
  listenedSeconds: number;
  lastTime: number;
  duration: number;
  reachedEnd: boolean;
  /** True right after a SEEK, so a scrub isn't mistaken for a loop/replay. */
  seeked: boolean;
}

let current: TrackedSpan | null = null;
let started = false;

function flush(): void {
  const span = current;
  current = null;

  if (!span) return;

  const listened = Math.round(span.listenedSeconds);
  const duration = Math.round(span.duration || Number(span.song.duration) || 0);

  if (listened < 2) return;

  const completed = span.reachedEnd || (duration > 0 && listened >= duration - 2);

  if (isValidPlay(listened, duration)) {
    // Completed listens weigh more in the local taste profile than bare
    // valid plays; skips never touch it.
    recordLocalPreference(span.song, completed ? 1.5 : 1);
  }

  void recordPlaybackObservation({
    songId: String(span.song.id),
    listenedSeconds: listened,
    duration,
    completed,
  });
}

function begin(song: RankableSong & { duration?: number }): void {
  flush();
  current = {
    song,
    listenedSeconds: 0,
    lastTime: 0,
    duration: Number(song.duration) || 0,
    reachedEnd: false,
    seeked: false,
  };
}

/**
 * Starts tracking. Safe to call more than once — only the first call binds.
 * Returns a teardown function.
 */
export function startEngagementTracking(): () => void {
  if (started || typeof window === "undefined") return () => undefined;
  started = true;

  const unsubscribers = [
    playbackEvents.on("SONG_CHANGE", ({ song }) => {
      if (!song) {
        flush();
        return;
      }
      begin(song);
    }),

    playbackEvents.on("TIME_UPDATE", ({ currentTime, duration }) => {
      const span = current;
      if (!span) return;

      if (Number.isFinite(duration) && duration > 0) {
        span.duration = duration;
      }

      const delta = currentTime - span.lastTime;

      if (delta < 0) {
        if (span.seeked) {
          // The user scrubbed backwards — same listening session, just a new
          // position. It is not a loop, a replay or a new play.
          span.seeked = false;
          span.lastTime = currentTime;
          return;
        }

        // The track looped (repeat-one) — close the previous span and reopen.
        span.reachedEnd = true;
        const song = span.song;
        flush();
        begin(song);
        return;
      }

      if (delta > 0 && delta <= MAX_TICK_SECONDS) {
        span.listenedSeconds += delta;
      }

      span.seeked = false;
      span.lastTime = currentTime;

      // "Completed" means the listener actually heard the track through, so
      // it requires real listening time — scrubbing to the end never counts.
      if (
        span.duration > 0 &&
        currentTime >= span.duration - 1 &&
        isValidPlay(span.listenedSeconds, span.duration)
      ) {
        span.reachedEnd = true;
      }
    }),

    // Seeking only moves the audio position; it must never create a new
    // play, a replay or a separate session in the ranking signals.
    playbackEvents.on("SEEK", ({ seconds }) => {
      const span = current;
      if (!span) return;
      span.seeked = true;
      span.lastTime = seconds;
    }),

    playbackEvents.on("QUEUE_ENDED", () => flush()),

    playbackEvents.on("ERROR", () => flush()),
  ];

  const onHidden = () => {
    if (document.visibilityState === "hidden") flush();
  };

  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", onHidden);

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
    window.removeEventListener("pagehide", flush);
    document.removeEventListener("visibilitychange", onHidden);
    flush();
    started = false;
  };
}
