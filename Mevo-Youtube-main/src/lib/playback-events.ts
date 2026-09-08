import type { QueueSource, Song } from "@/data/songs";

/**
 * Playback event bus.
 *
 * React context already gives every component the current playback state,
 * so this bus is deliberately NOT the primary way UI reads state — it's for
 * cross-cutting concerns that shouldn't live inside the render tree at all:
 * analytics/scrobbling, debugging/dev-tools, toast notifications on errors,
 * and any future integration (e.g. a browser extension, a desktop tray
 * widget) that wants to observe playback without subscribing to React.
 *
 * TIME_UPDATE is throttled at the emit site (player-context) — it is NOT
 * emitted on every `timeupdate` tick, only a few times a second, so a
 * listener here never becomes a performance liability.
 */
export type PlaybackEventMap = {
  PLAY: { song: Song };
  PAUSE: { song: Song | null };
  NEXT: { song: Song | null; auto: boolean };
  PREVIOUS: { song: Song | null };
  SONG_CHANGE: { song: Song | null; previous: Song | null };
  QUEUE_CHANGE: {
    queue: Song[];
    source: QueueSource | null;
    reason:
      | "play"
      | "play-next"
      | "add-to-queue"
      | "remove"
      | "clear"
      | "shuffle"
      | "restore"
      | "reorder"
      | "autoplay";
  };
  TIME_UPDATE: { currentTime: number; duration: number };
  SEEK: { seconds: number };
  SHUFFLE: { enabled: boolean };
  REPEAT: { mode: "default" | "one" | "off" | "all" };
  LIKE: { id: string };
  UNLIKE: { id: string };
  BUFFERING: { buffering: boolean };
  ERROR: { message: string; songId: string | null; recoverable: boolean };
  QUEUE_ENDED: { autoplayed: boolean };
  AUTOPLAY: { enabled: boolean };
  TASTE_UPDATED: { timestamp: number };
  SECTION_PREPENDED: { categoryId: string; song: Song };
  QUICK_PICKS_UPDATED: { song: Song };
};

type Listener<K extends keyof PlaybackEventMap> = (payload: PlaybackEventMap[K]) => void;

class PlaybackEventBus {
  private listeners: {
    [K in keyof PlaybackEventMap]?: Set<Listener<K>>;
  } = {};

  on<K extends keyof PlaybackEventMap>(event: K, listener: Listener<K>): () => void {
    const existing = this.listeners[event] as Set<Listener<K>> | undefined;
    const set = existing ?? new Set<Listener<K>>();
    (this.listeners as Record<string, unknown>)[event as string] = set;
    set.add(listener);
    return () => set.delete(listener);
  }

  emit<K extends keyof PlaybackEventMap>(event: K, payload: PlaybackEventMap[K]): void {
    const set = this.listeners[event] as Set<Listener<K>> | undefined;
    if (!set || set.size === 0) return;
    for (const listener of set) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`playback-events: listener for ${event} threw`, error);
      }
    }
  }
}

/** Singleton — one playback session per tab, one bus per session. */
export const playbackEvents = new PlaybackEventBus();
