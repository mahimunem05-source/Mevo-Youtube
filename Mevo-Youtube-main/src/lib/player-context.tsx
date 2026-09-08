import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  songs as staticSongs,
  isSongExplicit,
  isYouTubeSong,
  type NavigationSource,
  type QueueSource,
  type Song,
} from "@/data/songs";
import { getSongs, incrementPlayCount } from "@/services/songService";
import { recordPlay, recordSongPlayedTimestamp } from "@/services/listeningHistoryService";
import { subscribeToRealtimeChanges } from "@/lib/realtime-helper";
import { databaseSongToPlayerSong, mergePlayerSongs } from "@/lib/song-adapter";
import { playbackEvents } from "@/lib/playback-events";
import { startEngagementTracking } from "@/lib/ranking/engagement-tracker";
import { createUniversalSmartQueue, generateDiscoveryQueue } from "@/lib/ranking/queue-engine";
import { useSettings } from "@/context/SettingsContext";
import { getYouTubeStreamUrl, extractYouTubeVideoId } from "@/lib/extractor";
import { youtubePlayerBridge } from "@/lib/youtube-player-bridge";
import { getRelatedTracks } from "@/lib/youtube-api";
import {
  recordPlayAffinity,
  generateRadioQueue,
  fetchQueueContinuation,
} from "@/lib/youtube-radio";
import {
  recordTrackStarted,
  recordTrackProgress,
  recordTrackCompleted,
  recordTrackSkipped,
  getLastPlayedTrack,
  setLastPlayedTrack,
  getUserTasteGraph,
} from "@/lib/user-taste";

export type RepeatMode = "default" | "one";

interface PlaybackSession {
  originalQueue: Song[];
  queue: Song[];
  currentIndex: number;
  queueSource: QueueSource | null;
  navigationSource: NavigationSource | null;
  playbackSource: string | null;
  history: string[];
}

const EMPTY_SESSION: PlaybackSession = {
  originalQueue: [],
  queue: [],
  currentIndex: -1,
  queueSource: null,
  navigationSource: null,
  playbackSource: null,
  history: [],
};

interface PlayerState {
  current: Song | null;
  catalogue: Song[];
  originalQueue: Song[];
  queue: Song[];
  queueIds: string[];
  currentIndex: number;
  queueSource: QueueSource | null;
  navigationSource: NavigationSource | null;
  playbackSource: string | null;
  history: string[];
  isPlaying: boolean;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  likes: string[];
  favoriteSongs: Song[];
  recent: Song[];
  play: (song: Song, navigationSource?: NavigationSource, playbackSource?: string | null) => void;
  playFromCollection: (
    songs: Song[],
    selectedIndex: number,
    source: QueueSource,
    navigationSource?: NavigationSource,
    playbackSource?: string | null,
  ) => void;
  playNewQueue: (
    songs: Song[],
    selectedIndex: number,
    source: QueueSource,
    navigationSource?: NavigationSource,
    playbackSource?: string | null,
  ) => void;
  playFromCurrentQueue: (index: number) => void;
  playQueueIndex: (index: number) => void;
  ensureQueueContainsSong: (song: Song) => void;
  /** Insert a song immediately after the currently playing track. */
  playNext: (song: Song) => void;
  /** Append a song to the end of the queue. */
  addToQueue: (song: Song) => void;
  /** Append multiple unique songs to the end of the queue. */
  appendSongsToQueue: (songs: Song[]) => void;
  /** Remove a song from the queue by its position. Adjusts playback if it was the current track. */
  removeFromQueue: (index: number) => void;
  /** Clear every queued track except the one currently playing. */
  clearQueue: () => void;
  /** Move a queued track from one position to another (drag-to-reorder). */
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleRepeat: () => void;
  toggleLike: (songOrId: string | Song, fallbackSong?: Song) => void;
  isLiked: (id: string) => boolean;
  /** Bottom player visibility — hidden on first visit, shown once a song plays. */
  playerVisible: boolean;
  hidePlayer: () => void;
  /** True while the current track is loading/stalled and audible playback has paused to buffer. */
  isBuffering: boolean;
  /** Most recent unrecoverable playback error, if any (cleared on next successful play). */
  playbackError: string | null;
  /** Whether the queue auto-extends with recommendations when it ends (default on). */
  autoplayEnabled: boolean;
  toggleAutoplay: () => void;
}

const PlayerContext = createContext<PlayerState | null>(null);

/**
 * currentTime/duration change up to 4x/sec during playback. They're kept
 * out of PlayerState and in their own context so that progress bars
 * (e.g. SeekBar) subscribe without forcing every other usePlayer() consumer
 * across the app to re-render on every tick.
 */
interface PlayerProgressState {
  progress: number;
  duration: number;
}
const PlayerProgressContext = createContext<PlayerProgressState>({
  progress: 0,
  duration: 0,
});

const FAVORITES_STORAGE_KEY = "mevo_favorites";
const LIKES_KEY = "mahi-music:likes";
const PLAYER_STORAGE_KEY = "mahi-music-playback-session-v3";
const PLAYER_DISMISSED_KEY = "mahi-music:player-dismissed";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface StoredPlaybackSession {
  originalQueueIds: string[];
  queueIds: string[];
  currentSongId: string | null;
  queueSource: QueueSource | null;
  navigationSource: NavigationSource | null;
  playbackSource?: string | null;
  history: string[];
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  autoplayEnabled: boolean;
}

function readStoredFavorites(): Song[] {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(FAVORITES_STORAGE_KEY) : null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((s): s is Song => Boolean(s && typeof s === "object" && s.id && s.title));
      }
    }
  } catch (err) {
    console.warn("Could not read stored favorites:", err);
  }
  return [];
}

function readStoredLikes(): string[] {
  try {
    const favs = readStoredFavorites();
    const favIds = favs.map((s) => s.id);
    const parsed = JSON.parse(
      typeof window !== "undefined" ? window.localStorage.getItem(LIKES_KEY) ?? "[]" : "[]",
    ) as unknown;
    const rawLikes = Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
    return Array.from(new Set([...favIds, ...rawLikes]));
  } catch {
    return [];
  }
}

function isQueueSource(value: unknown): value is QueueSource {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.type === "string" &&
    typeof candidate.id === "string" &&
    typeof candidate.title === "string"
  );
}

function isNavigationSource(value: unknown): value is NavigationSource {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    isQueueSource(value) &&
    typeof candidate.pathname === "string" &&
    typeof candidate.label === "string"
  );
}

function isMahiSelectContext(
  source?: QueueSource | null,
  explicitPlaybackSource?: string | null,
  song?: Song | null,
): boolean {
  if (explicitPlaybackSource === "mahi_select") return true;
  if (source) {
    const id = source.id?.toLowerCase() || "";
    const title = source.title?.toLowerCase() || "";
    if (
      id === "mahi_select" ||
      id === "mahi-select" ||
      id === "mahis-favourite" ||
      id === "favourite" ||
      id === "favourite-featured" ||
      id === "mahi-select-featured"
    ) {
      return true;
    }
    if (
      title.includes("mahi select") ||
      title.includes("mahi's favourite") ||
      title.includes("mahis favourite")
    ) {
      return true;
    }
  }
  if (
    song &&
    (song.section === "favourite" ||
      song.category === "Mahi Select" ||
      song.category === "Mahi's Favourite")
  ) {
    return true;
  }
  return false;
}

function isCustomPlaylistContext(
  source?: QueueSource | null,
  explicitPlaybackSource?: string | null,
): boolean {
  if (explicitPlaybackSource === "custom_playlist") return true;
  if (source?.type === "playlist") return true;
  const id = source?.id?.toLowerCase() || "";
  if (id.startsWith("playlist-") || id.startsWith("custom-")) return true;
  return false;
}

function isIsolatedPlaybackContext(
  source?: QueueSource | null,
  explicitPlaybackSource?: string | null,
  song?: Song | null,
): boolean {
  return (
    isMahiSelectContext(source, explicitPlaybackSource, song) ||
    isCustomPlaylistContext(source, explicitPlaybackSource)
  );
}

function readStoredSession(): StoredPlaybackSession | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PLAYER_STORAGE_KEY) ?? "null") as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Record<string, unknown>;
    if (!Array.isArray(value.queueIds) || !Array.isArray(value.originalQueueIds)) {
      return null;
    }
    const queueIds = value.queueIds.filter((id): id is string => typeof id === "string");
    const originalQueueIds = value.originalQueueIds.filter(
      (id): id is string => typeof id === "string",
    );
    if (queueIds.length === 0 || originalQueueIds.length === 0) return null;

    const repeat: RepeatMode = value.repeat === "one" ? "one" : "default";

    return {
      queueIds,
      originalQueueIds,
      currentSongId: typeof value.currentSongId === "string" ? value.currentSongId : null,
      queueSource: isQueueSource(value.queueSource) ? value.queueSource : null,
      navigationSource: isNavigationSource(value.navigationSource) ? value.navigationSource : null,
      playbackSource: typeof value.playbackSource === "string" ? value.playbackSource : null,
      history: Array.isArray(value.history)
        ? value.history.filter((id): id is string => typeof id === "string").slice(-100)
        : [],
      shuffle: value.shuffle === true,
      repeat,
      volume:
        typeof value.volume === "number" && Number.isFinite(value.volume)
          ? Math.min(Math.max(value.volume, 0), 1)
          : 0.8,
      autoplayEnabled: value.autoplayEnabled !== false,
    };
  } catch {
    return null;
  }
}

function readStoredRecentSongs(): Song[] {
  try {
    const taste = getUserTasteGraph();
    if (taste?.recentHistory && Array.isArray(taste.recentHistory)) {
      const seen = new Set<string>();
      return taste.recentHistory
        .map((h) => h.song)
        .filter((song): song is Song => {
          if (!song || !song.id) return false;
          const rawId = song.id.replace(/^yt-/, "").trim().toLowerCase();
          if (seen.has(rawId)) return false;
          seen.add(rawId);
          return true;
        })
        .slice(0, 16);
    }
  } catch {
    /* ignore */
  }
  return [];
}

function dedupeSongs(songs: Song[]): Song[] {
  const seen = new Set<string>();
  return songs.filter((song) => {
    const rawId = (song.id || "").replace(/^yt-/, "").trim().toLowerCase();
    if (!rawId || seen.has(rawId)) return false;
    seen.add(rawId);
    return true;
  });
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { settings, updateSetting } = useSettings();

  // 1. Single Dedicated HTMLAudioElement Reference
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [catalogue, setCatalogue] = useState<Song[]>([...staticSongs]);
  const [session, setSession] = useState<PlaybackSession>(EMPTY_SESSION);
  const [isPlaying, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>(() => {
    const stored = readStoredSession();
    return stored?.repeat === "one" ? "one" : "default";
  });
  const repeatRef = useRef<RepeatMode>(repeat);
  useEffect(() => {
    repeatRef.current = repeat;
  }, [repeat]);
  const [favoriteSongs, setFavoriteSongs] = useState<Song[]>(() => readStoredFavorites());
  const [likes, setLikes] = useState<string[]>(() => readStoredLikes());
  const [recent, setRecent] = useState<Song[]>(() => readStoredRecentSongs());
  const [isBuffering, setIsBuffering] = useState(false);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  // Listen to window storage events to sync favorites across tabs / windows
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === FAVORITES_STORAGE_KEY || e.key === LIKES_KEY) {
        const updatedFavs = readStoredFavorites();
        setFavoriteSongs(updatedFavs);
        setLikes(updatedFavs.map((s) => s.id));
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const pendingRestoreRef = useRef<StoredPlaybackSession | null>(null);
  const loadTokenRef = useRef(0);
  const shufflePlayedIdsRef = useRef<Set<string>>(new Set());
  const lastTimeEventRef = useRef(0);
  const trackListenedSecondsRef = useRef(0);

  // Bottom player visibility
  const [playerVisible, setPlayerVisible] = useState(false);

  const autoplayEnabled = settings.autoplay;
  const toggleAutoplay = useCallback(() => {
    const next = !settings.autoplay;
    updateSetting("autoplay", next);
    playbackEvents.emit("AUTOPLAY", { enabled: next });
  }, [settings.autoplay, updateSetting]);

  const current = session.currentIndex >= 0 ? (session.queue[session.currentIndex] ?? null) : null;
  const currentRef = useRef<Song | null>(current);
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  // Anonymous engagement tracking
  useEffect(() => startEngagementTracking(), []);

  // Restore stored session on mount
  useEffect(() => {
    pendingRestoreRef.current = readStoredSession();
    const stored = pendingRestoreRef.current;
    if (stored) {
      setShuffle(stored.shuffle);
      setRepeat(stored.repeat);
      setVolumeState(stored.volume);
    }
    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(PLAYER_DISMISSED_KEY) === "1";
    } catch {
      dismissed = false;
    }
    if (stored && !dismissed) setPlayerVisible(true);
    setFavoriteSongs(readStoredFavorites());
    setLikes(readStoredLikes());
  }, []);

  const hidePlayer = useCallback(() => {
    setPlayerVisible(false);
    try {
      window.localStorage.setItem(PLAYER_DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  // Fetch / Sync Catalogue
  useEffect(() => {
    let isMounted = true;

    async function refreshCatalogue() {
      try {
        const uploadedSongs = await getSongs();
        if (!isMounted) return;

        const nextCatalogue = mergePlayerSongs(
          uploadedSongs.map((song) => databaseSongToPlayerSong(song)),
          staticSongs,
        );
        setCatalogue(nextCatalogue);
        setRecent((previous) =>
          previous.map(
            (song) => nextCatalogue.find((candidate) => candidate.id === song.id) ?? song,
          ),
        );

        const stored = pendingRestoreRef.current;
        if (stored) {
          pendingRestoreRef.current = null;
          const mapIds = (ids: string[]) =>
            ids
              .map((id) => nextCatalogue.find((song) => song.id === id))
              .filter((song): song is Song => Boolean(song));
          const originalQueue = mapIds(stored.originalQueueIds);
          const queue = mapIds(stored.queueIds);
          if (originalQueue.length > 0 && queue.length > 0) {
            const currentIndex = stored.currentSongId
              ? queue.findIndex((song) => song.id === stored.currentSongId)
              : 0;
            const isMahi = isMahiSelectContext(stored.queueSource, stored.playbackSource);
            setSession({
              originalQueue,
              queue,
              currentIndex: currentIndex >= 0 ? currentIndex : 0,
              queueSource: stored.queueSource,
              navigationSource: stored.navigationSource,
              playbackSource: stored.playbackSource ?? (isMahi ? "mahi_select" : null),
              history: stored.history,
            });
            return;
          }
        }

        setSession((previous) => {
          if (previous.queue.length === 0) return previous;
          const refresh = (songs: Song[]) =>
            songs.map(
              (song) => nextCatalogue.find((candidate) => candidate.id === song.id) ?? song,
            );
          return {
            ...previous,
            queue: refresh(previous.queue),
            originalQueue: refresh(previous.originalQueue),
          };
        });
      } catch (error) {
        console.error("Could not refresh the player catalogue:", error);
      }
    }

    void refreshCatalogue();

    const cleanup = subscribeToRealtimeChanges("player-catalogue-songs", [
      {
        table: "songs",
        callback: () => void refreshCatalogue(),
      },
    ]);

    return () => {
      isMounted = false;
      cleanup();
    };
  }, []);

  // Persist playback session to localStorage
  useEffect(() => {
    try {
      if (session.queue.length === 0) {
        window.localStorage.removeItem(PLAYER_STORAGE_KEY);
        return;
      }
      const payload: StoredPlaybackSession = {
        originalQueueIds: session.originalQueue.map((song) => song.id),
        queueIds: session.queue.map((song) => song.id),
        currentSongId: current?.id ?? null,
        queueSource: session.queueSource,
        navigationSource: session.navigationSource,
        playbackSource: session.playbackSource,
        history: session.history,
        shuffle,
        repeat,
        volume,
        autoplayEnabled,
      };
      window.localStorage.setItem(PLAYER_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.error("Could not persist playback session:", error);
    }
  }, [session, current?.id, shuffle, repeat, volume, autoplayEnabled]);

  // Synchronize volume & mute state directly to the single audio element & YouTube bridge
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      const targetVolume = muted ? 0 : Math.max(0, Math.min(1, volume));
      audio.volume = targetVolume;
      audio.muted = muted;
    }
    youtubePlayerBridge.setVolume(volume, muted);
  }, [volume, muted]);

  // Safe playback trigger
  const executePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    // Explicitly verify audio volume & mute state prior to play
    audio.muted = muted;
    audio.volume = muted ? 0 : Math.max(0, Math.min(1, volume));

    try {
      await audio.play();
    } catch (error: unknown) {
      const err = error as { name?: string; message?: string };
      if (err.name === "AbortError") {
        // Normal when user skips quickly between tracks; safely ignore
        return;
      }
      console.warn("[Mahi Music Audio] Playback execution notice:", error);
      setPlaying(false);
    }
  }, [muted, volume]);

  const activateSong = useCallback(
    (
      song: Song,
      previousSong?: Song | null,
      explicitPlaybackSource?: string | null,
      options?: { isIntraQueueNavigation?: boolean },
    ) => {
      // Check explicit content restriction
      if (!settings.allowExplicitContent && isSongExplicit(song)) {
        setPlaying(false);
        const message = `Explicit content is disabled in your Settings.`;
        setPlaybackError(message);
        playbackEvents.emit("ERROR", {
          message,
          songId: song.id,
          recoverable: true,
        });
        return;
      }

      setPlaying(true);
      setProgress(0);
      if (song.duration && song.duration > 0) {
        setDuration(song.duration);
      }
      setPlaybackError(null);
      setPlayerVisible(true);

      try {
        window.localStorage.removeItem(PLAYER_DISMISSED_KEY);
      } catch {
        /* ignore */
      }

      // 1. Record listening activity, affinity profile & user taste scores
      recordPlayAffinity(song);
      if (previousSong) {
        if (trackListenedSecondsRef.current < 15) {
          recordTrackSkipped(previousSong, trackListenedSecondsRef.current);
        } else if (trackListenedSecondsRef.current >= 40) {
          recordTrackCompleted(previousSong);
        }
      }
      trackListenedSecondsRef.current = 0;
      recordTrackStarted(song);

      const shouldLogActivity = settings.showListeningActivity && !settings.privateSession;
      if (shouldLogActivity) {
        setRecent((previous) => {
          const songRawId = (song.id || "").replace(/^yt-/, "").trim().toLowerCase();
          const filtered = previous.filter(
            (item) => (item.id || "").replace(/^yt-/, "").trim().toLowerCase() !== songRawId
          );
          return [song, ...filtered].slice(0, 16);
        });
        void recordPlay(song.id);
        recordSongPlayedTimestamp(song.id);
        if (UUID_PATTERN.test(song.id)) {
          void incrementPlayCount(song.id).catch((error) =>
            console.error("Could not increment play count:", error),
          );
        }
      }

      playbackEvents.emit("SONG_CHANGE", { song, previous: previousSong ?? null });
      playbackEvents.emit("PLAY", { song });

      // 2. Asynchronously generate dynamic YouTube Watch-Next Radio queue for the playing track
      // Strictly bypass if in an isolated playback flow or during intra-queue navigation
      const isIsolated = isIsolatedPlaybackContext(
        session.queueSource,
        explicitPlaybackSource ?? session.playbackSource,
        song,
      );

      if (
        autoplayEnabled &&
        song.title &&
        !isIsolated &&
        !options?.isIntraQueueNavigation
      ) {
        void generateRadioQueue(song)
          .then((radioTracks) => {
            if (!radioTracks || radioTracks.length === 0) return;

            setSession((prev) => {
              // Safety check: do not inject into isolated queue
              if (
                prev.playbackSource === "mahi_select" ||
                prev.playbackSource === "custom_playlist" ||
                isIsolatedPlaybackContext(prev.queueSource, prev.playbackSource)
              ) {
                return prev;
              }

              // ONLY populate/replace when user originally started from a single-track seed (queue length <= 1)
              if (prev.queue.length <= 1) {
                const currentTrack = prev.queue[0] || song;
                const currentRawId = (currentTrack.id || "").replace(/^yt-/, "").trim().toLowerCase();
                const freshTracks = radioTracks.filter(
                  (t) => (t.id || "").replace(/^yt-/, "").trim().toLowerCase() !== currentRawId
                );
                const nextQueue = [currentTrack, ...freshTracks];
                const nextOriginalQueue = dedupeSongs([currentTrack, ...freshTracks]);

                playbackEvents.emit("QUEUE_CHANGE", {
                  queue: nextQueue,
                  source: prev.queueSource,
                  reason: "autoplay",
                });

                return {
                  ...prev,
                  queue: nextQueue,
                  originalQueue: nextOriginalQueue,
                  currentIndex: 0,
                };
              } else {
                // When queue already has multiple tracks (e.g. album, section, custom playlist, or populated queue),
                // DO NOT wipe or reset currentIndex!
                // Append only new unique tracks to the END of the queue.
                const existingIds = new Set(
                  prev.queue.map((q) => (q.id || "").replace(/^yt-/, "").trim().toLowerCase())
                );
                const freshTracks = radioTracks.filter(
                  (t) => !existingIds.has((t.id || "").replace(/^yt-/, "").trim().toLowerCase())
                );
                if (freshTracks.length === 0) return prev;

                const nextQueue = [...prev.queue, ...freshTracks];
                const nextOriginalQueue = dedupeSongs([...prev.originalQueue, ...freshTracks]);

                playbackEvents.emit("QUEUE_CHANGE", {
                  queue: nextQueue,
                  source: prev.queueSource,
                  reason: "autoplay",
                });

                return {
                  ...prev,
                  queue: nextQueue,
                  originalQueue: nextOriginalQueue,
                };
              }
            });
          })
          .catch((err) => {
            console.warn("YouTube Radio queue generation notice:", err);
          });
      }
    },
    [settings.allowExplicitContent, settings.showListeningActivity, settings.privateSession, autoplayEnabled, session.queueSource, session.playbackSource],
  );

  const playFromCollection = useCallback(
    (
      songsList: Song[],
      selectedIndex: number,
      source: QueueSource,
      navigationSource?: NavigationSource,
      playbackSource?: string | null,
    ) => {
      if (!songsList || songsList.length === 0) return;
      const validIndex = Math.max(0, Math.min(selectedIndex, songsList.length - 1));
      const selectedSong = songsList[validIndex] ?? songsList[0];

      shufflePlayedIdsRef.current = new Set([selectedSong.id]);
      const previousSong = current;

      const resolvedNavSource: NavigationSource = navigationSource ?? {
        ...source,
        pathname: "/",
        label: source.title,
      };

      const isMahi = isMahiSelectContext(source, playbackSource, selectedSong);
      const resolvedPlaybackSource = isMahi ? "mahi_select" : (playbackSource ?? null);

      setSession({
        originalQueue: [...songsList],
        queue: [...songsList],
        currentIndex: validIndex,
        queueSource: source,
        navigationSource: resolvedNavSource,
        playbackSource: resolvedPlaybackSource,
        history: [],
      });

      activateSong(selectedSong, previousSong, resolvedPlaybackSource);
      playbackEvents.emit("QUEUE_CHANGE", {
        queue: songsList,
        source,
        reason: "play",
      });
    },
    [activateSong, current],
  );

  const playNewQueue = useCallback(
    (
      songsList: Song[],
      selectedIndex: number,
      source: QueueSource,
      navigationSource?: NavigationSource,
      playbackSource?: string | null,
    ) => {
      playFromCollection(songsList, selectedIndex, source, navigationSource, playbackSource);
    },
    [playFromCollection],
  );

  const play = useCallback(
    (song: Song, navigationSource?: NavigationSource, playbackSource?: string | null) => {
      const isMahi = isMahiSelectContext(undefined, playbackSource, song);
      if (isMahi) {
        const manualTracks = catalogue.filter(
          (s) =>
            s.section === "favourite" ||
            s.category === "Mahi Select" ||
            s.category === "Mahi's Favourite" ||
            !isYouTubeSong(s),
        );
        const list = manualTracks.length > 0 ? manualTracks : [song];
        const index = list.findIndex((s) => s.id === song.id);
        const source: QueueSource = {
          type: "section",
          id: "mahi-select",
          title: "Mahi Select",
        };
        playFromCollection(
          list,
          index >= 0 ? index : 0,
          source,
          navigationSource,
          "mahi_select",
        );
        return;
      }

      const source: QueueSource = {
        type: "section",
        id: song.section || "youtube-radio",
        title: song.category || "YouTube Radio",
      };
      playFromCollection([song], 0, source, navigationSource, playbackSource);
    },
    [catalogue, playFromCollection],
  );

  const playFromCurrentQueue = useCallback(
    (index: number) => {
      setSession((previous) => {
        if (index < 0 || index >= previous.queue.length) return previous;
        const song = previous.queue[index];
        if (!song) return previous;
        const previousSong = previous.queue[previous.currentIndex];
        activateSong(song, previousSong, previous.playbackSource, { isIntraQueueNavigation: true });
        return {
          ...previous,
          currentIndex: index,
          history: previousSong
            ? [...previous.history, previousSong.id].slice(-100)
            : previous.history,
        };
      });
    },
    [activateSong],
  );

  const playQueueIndex = playFromCurrentQueue;

  const ensureQueueContainsSong = useCallback(
    (song: Song) => {
      setSession((previous) => {
        if (previous.queue.some((item) => item.id === song.id)) return previous;
        if (previous.queue.length > 0) return previous;

        const isMahi = isMahiSelectContext(previous.queueSource, previous.playbackSource, song);
        if (isMahi) {
          const manualTracks = catalogue.filter(
            (s) =>
              s.section === "favourite" ||
              s.category === "Mahi Select" ||
              s.category === "Mahi's Favourite" ||
              !isYouTubeSong(s),
          );
          const list = manualTracks.length > 0 ? manualTracks : [song];
          const index = list.findIndex((s) => s.id === song.id);
          const source: QueueSource = {
            type: "section",
            id: "mahi-select",
            title: "Mahi Select",
          };
          return {
            originalQueue: list,
            queue: list,
            currentIndex: index >= 0 ? index : 0,
            queueSource: source,
            navigationSource: {
              ...source,
              pathname: "/section/mahis-favourite",
              label: "Mahi Select",
            },
            playbackSource: "mahi_select",
            history: [],
          };
        }

        const albumSongs = catalogue.filter(
          (item) => item.album === song.album && item.album.trim().length > 0,
        );
        const artistSongs = catalogue.filter((item) => item.artist === song.artist);
        const sectionSongs = catalogue.filter((item) => item.section === song.section);
        const collection =
          albumSongs.length > 1
            ? albumSongs
            : artistSongs.length > 1
              ? artistSongs
              : sectionSongs.length > 0
                ? sectionSongs
                : [song];
        const type: QueueSource["type"] =
          albumSongs.length > 1 ? "album" : artistSongs.length > 1 ? "artist" : "section";
        const id = type === "album" ? song.album : type === "artist" ? song.artist : song.section;
        const title =
          type === "album" ? song.album : type === "artist" ? song.artist : song.category;

        const smartQueue = createUniversalSmartQueue({
          currentTrack: song,
          contextSongs: collection,
          catalogue,
          queueSource: { type, id, title },
          navigationSource: null,
        });

        return {
          originalQueue: smartQueue.originalQueue,
          queue: smartQueue.queue,
          currentIndex: smartQueue.currentIndex,
          queueSource: smartQueue.queueSource,
          navigationSource: smartQueue.navigationSource,
          playbackSource: null,
          history: [],
        };
      });
    },
    [catalogue],
  );

  const playNext = useCallback((song: Song) => {
    setSession((previous) => {
      if (previous.currentIndex < 0) return previous;
      const withoutSong = previous.queue.filter((item) => item.id !== song.id);
      const insertAt = Math.min(previous.currentIndex + 1, withoutSong.length);
      const queue = [...withoutSong.slice(0, insertAt), song, ...withoutSong.slice(insertAt)];
      const currentSongId = previous.queue[previous.currentIndex]?.id;
      const currentIndex = queue.findIndex((item) => item.id === currentSongId);
      const originalQueue = dedupeSongs([...previous.originalQueue, song]);
      playbackEvents.emit("QUEUE_CHANGE", {
        queue,
        source: previous.queueSource,
        reason: "play-next",
      });
      return { ...previous, queue, originalQueue, currentIndex: Math.max(currentIndex, 0) };
    });
  }, []);

  const addToQueue = useCallback((song: Song) => {
    setSession((previous) => {
      if (previous.queue.some((item) => item.id === song.id)) return previous;
      const queue = [...previous.queue, song];
      const originalQueue = dedupeSongs([...previous.originalQueue, song]);
      playbackEvents.emit("QUEUE_CHANGE", {
        queue,
        source: previous.queueSource,
        reason: "add-to-queue",
      });
      return { ...previous, queue, originalQueue };
    });
  }, []);

  const appendSongsToQueue = useCallback((newSongs: Song[]) => {
    if (!newSongs || newSongs.length === 0) return;
    setSession((previous) => {
      const existingIds = new Set(
        previous.queue.map((s) => (s.id || "").replace(/^yt-/, "").trim().toLowerCase())
      );
      const uniqueNewSongs = newSongs.filter((s) => {
        const rawId = (s.id || "").replace(/^yt-/, "").trim().toLowerCase();
        if (!rawId || existingIds.has(rawId)) return false;
        existingIds.add(rawId);
        return true;
      });
      if (uniqueNewSongs.length === 0) return previous;
      const queue = [...previous.queue, ...uniqueNewSongs];
      const originalQueue = dedupeSongs([...previous.originalQueue, ...uniqueNewSongs]);
      playbackEvents.emit("QUEUE_CHANGE", {
        queue,
        source: previous.queueSource,
        reason: "add-to-queue",
      });
      return { ...previous, queue, originalQueue };
    });
  }, []);

  const removeFromQueue = useCallback(
    (index: number) => {
      setSession((previous) => {
        const target = previous.queue[index];
        if (!target) return previous;
        const queue = previous.queue.filter((_, i) => i !== index);
        const originalQueue = previous.originalQueue.filter((item) => item.id !== target.id);
        playbackEvents.emit("QUEUE_CHANGE", {
          queue,
          source: previous.queueSource,
          reason: "remove",
        });

        if (index > previous.currentIndex) {
          return { ...previous, queue, originalQueue };
        }
        if (index < previous.currentIndex) {
          return { ...previous, queue, originalQueue, currentIndex: previous.currentIndex - 1 };
        }
        if (queue.length === 0) {
          setPlaying(false);
          return { ...previous, queue, originalQueue, currentIndex: -1 };
        }
        const nextIndex = Math.min(index, queue.length - 1);
        activateSong(queue[nextIndex], target);
        return { ...previous, queue, originalQueue, currentIndex: nextIndex };
      });
    },
    [activateSong],
  );

  const reorderQueue = useCallback(
    (fromIndex: number, toIndex: number) => {
      setSession((previous) => {
        if (
          fromIndex < 0 ||
          fromIndex >= previous.queue.length ||
          toIndex < 0 ||
          toIndex >= previous.queue.length ||
          fromIndex === toIndex
        ) {
          return previous;
        }

        const queue = [...previous.queue];
        const [moved] = queue.splice(fromIndex, 1);
        queue.splice(toIndex, 0, moved);

        let currentIndex = previous.currentIndex;
        if (previous.currentIndex === fromIndex) {
          currentIndex = toIndex;
        } else if (
          fromIndex < previous.currentIndex &&
          toIndex >= previous.currentIndex
        ) {
          currentIndex = previous.currentIndex - 1;
        } else if (
          fromIndex > previous.currentIndex &&
          toIndex <= previous.currentIndex
        ) {
          currentIndex = previous.currentIndex + 1;
        }

        playbackEvents.emit("QUEUE_CHANGE", { queue, source: previous.queueSource, reason: "reorder" });
        return { ...previous, queue, currentIndex };
      });
    },
    [],
  );

  const clearQueue = useCallback(() => {
    setSession((previous) => {
      const currentSong = previous.queue[previous.currentIndex];
      const queue = currentSong ? [currentSong] : [];
      playbackEvents.emit("QUEUE_CHANGE", { queue, source: previous.queueSource, reason: "clear" });
      return { ...previous, queue, originalQueue: queue, currentIndex: queue.length > 0 ? 0 : -1 };
    });
  }, []);

  const step = useCallback(
    (direction: 1 | -1, auto = false) => {
      setSession((previous) => {
        if (previous.queue.length === 0 || previous.currentIndex < 0) return previous;
        const currentSong = previous.queue[previous.currentIndex];
        const isMahi =
          previous.playbackSource === "mahi_select" ||
          isMahiSelectContext(previous.queueSource, previous.playbackSource, currentSong);
        const isCustom =
          previous.playbackSource === "custom_playlist" ||
          isCustomPlaylistContext(previous.queueSource, previous.playbackSource);
        const isIsolated = isMahi || isCustom;
        const isolatedSourceKey = isCustom ? "custom_playlist" : "mahi_select";

        // 1. Isolated Playback Flow (Mahi Select & Custom Albums/Playlists)
        // Completely isolated from YouTube recommendations
        if (isIsolated) {
          if (shuffle && currentSong) {
            if (direction === -1) {
              if (previous.history.length === 0) return previous;
              const previousId = previous.history[previous.history.length - 1];
              const previousSong =
                previous.queue.find((song) => song.id === previousId) ??
                catalogue.find((song) => song.id === previousId);
              if (!previousSong) {
                return { ...previous, history: previous.history.slice(0, -1) };
              }
              activateSong(previousSong, currentSong, isolatedSourceKey, { isIntraQueueNavigation: true });
              playbackEvents.emit("PREVIOUS", { song: previousSong });
              const restoredIndex = previous.queue.findIndex((song) => song.id === previousSong.id);
              return {
                ...previous,
                currentIndex: restoredIndex >= 0 ? restoredIndex : previous.currentIndex,
                history: previous.history.slice(0, -1),
              };
            }

            let pool = previous.queue.filter(
              (song) => song.id !== currentSong.id && !shufflePlayedIdsRef.current.has(song.id),
            );
            let cycleReset = false;
            if (pool.length === 0) {
              pool = previous.queue.filter((song) => song.id !== currentSong.id);
              cycleReset = true;
            }

            const nextSong =
              pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : currentSong;
            if (nextSong.id === currentSong.id) return previous;

            shufflePlayedIdsRef.current = cycleReset
              ? new Set([nextSong.id])
              : new Set(shufflePlayedIdsRef.current).add(nextSong.id);

            activateSong(nextSong, currentSong, isolatedSourceKey, { isIntraQueueNavigation: true });
            playbackEvents.emit("NEXT", { song: nextSong, auto });
            const nextIndex = previous.queue.findIndex((song) => song.id === nextSong.id);
            return {
              ...previous,
              currentIndex: nextIndex >= 0 ? nextIndex : previous.currentIndex,
              history: [...previous.history, currentSong.id].slice(-100),
            };
          }

          // Sequential Mode: strictly queue[currentIndex + 1] or loop to beginning (index 0)
          const nextIndex =
            (previous.currentIndex + direction + previous.queue.length) % previous.queue.length;
          const song = previous.queue[nextIndex];
          if (song) activateSong(song, currentSong, isolatedSourceKey, { isIntraQueueNavigation: true });
          playbackEvents.emit(direction === 1 ? "NEXT" : "PREVIOUS", { song, auto });

          return {
            ...previous,
            currentIndex: nextIndex,
            history: currentSong
              ? [...previous.history, currentSong.id].slice(-100)
              : previous.history,
          };
        }

        // 2. Default YouTube / Radio Playback Flow
        // Shuffle Mode Handling
        if (shuffle && currentSong) {
          if (direction === -1) {
            if (previous.history.length === 0) return previous;
            const previousId = previous.history[previous.history.length - 1];
            const previousSong =
              previous.queue.find((song) => song.id === previousId) ??
              catalogue.find((song) => song.id === previousId);
            if (!previousSong) {
              return { ...previous, history: previous.history.slice(0, -1) };
            }
            activateSong(previousSong, currentSong, undefined, { isIntraQueueNavigation: true });
            playbackEvents.emit("PREVIOUS", { song: previousSong });
            const restoredIndex = previous.queue.findIndex((song) => song.id === previousSong.id);
            return {
              ...previous,
              currentIndex: restoredIndex >= 0 ? restoredIndex : previous.currentIndex,
              history: previous.history.slice(0, -1),
            };
          }

          let pool = previous.queue.filter(
            (song) => song.id !== currentSong.id && !shufflePlayedIdsRef.current.has(song.id),
          );
          let cycleReset = false;
          if (pool.length === 0) {
            pool = previous.queue.filter((song) => song.id !== currentSong.id);
            cycleReset = true;
          }

          const nextSong =
            pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : currentSong;
          if (nextSong.id === currentSong.id) return previous;

          shufflePlayedIdsRef.current = cycleReset
            ? new Set([nextSong.id])
            : new Set(shufflePlayedIdsRef.current).add(nextSong.id);

          activateSong(nextSong, currentSong, undefined, { isIntraQueueNavigation: true });
          playbackEvents.emit("NEXT", { song: nextSong, auto });
          const nextIndex = previous.queue.findIndex((song) => song.id === nextSong.id);
          return {
            ...previous,
            currentIndex: nextIndex >= 0 ? nextIndex : previous.currentIndex,
            history: [...previous.history, currentSong.id].slice(-100),
          };
        }

        // Sequential Mode Handling (Default YouTube Stream)
        const atEnd = previous.currentIndex >= previous.queue.length - 1;
        const atStart = previous.currentIndex <= 0;

        if (direction === 1 && atEnd) {
          const currentTrack = previous.queue[previous.currentIndex];
          if (autoplayEnabled && currentTrack) {
            void fetchQueueContinuation(currentTrack, previous.history)
              .then((continuationTracks) => {
                if (!continuationTracks || continuationTracks.length === 0) {
                  setPlaying(false);
                  return;
                }
                setSession((curr) => {
                  if (
                    curr.playbackSource === "mahi_select" ||
                    curr.playbackSource === "custom_playlist" ||
                    isIsolatedPlaybackContext(curr.queueSource, curr.playbackSource)
                  ) {
                    return curr;
                  }

                  const existingIds = new Set(
                    curr.queue.map((q) => (q.id || "").replace(/^yt-/, "").trim().toLowerCase())
                  );
                  const fresh = continuationTracks.filter(
                    (t) => !existingIds.has((t.id || "").replace(/^yt-/, "").trim().toLowerCase())
                  );
                  if (fresh.length === 0) {
                    setPlaying(false);
                    return curr;
                  }

                  const extendedQueue = [...curr.queue, ...fresh];
                  const extendedOriginal = dedupeSongs([...curr.originalQueue, ...fresh]);
                  const nextSong = fresh[0];
                  const nextIndex = curr.currentIndex + 1;

                  activateSong(nextSong, curr.queue[curr.currentIndex], undefined, { isIntraQueueNavigation: true });
                  playbackEvents.emit("NEXT", { song: nextSong, auto: true });
                  playbackEvents.emit("QUEUE_CHANGE", {
                    queue: extendedQueue,
                    source: curr.queueSource,
                    reason: "autoplay",
                  });

                  return {
                    ...curr,
                    queue: extendedQueue,
                    originalQueue: extendedOriginal,
                    currentIndex: nextIndex,
                    history: [...curr.history, curr.queue[curr.currentIndex]?.id].filter(Boolean) as string[],
                  };
                });
              })
              .catch(() => setPlaying(false));
            return previous;
          }

          setPlaying(false);
          return {
            ...previous,
            currentIndex: 0,
            history: currentTrack
              ? [...previous.history, currentTrack.id].slice(-100)
              : previous.history,
          };
        }

        if (direction === -1 && atStart) {
          return previous;
        }

        const nextIndex =
          (previous.currentIndex + direction + previous.queue.length) % previous.queue.length;
        const song = previous.queue[nextIndex];
        const previousSong = previous.queue[previous.currentIndex];
        if (song) activateSong(song, previousSong, undefined, { isIntraQueueNavigation: true });
        playbackEvents.emit(direction === 1 ? "NEXT" : "PREVIOUS", { song, auto });

        // Continuous Queue Replenishment: If <= 3 tracks remain, fetch next radio batch
        const remaining = previous.queue.length - (nextIndex + 1);
        if (direction === 1 && autoplayEnabled && remaining <= 3 && song && !isIsolated) {
          void fetchQueueContinuation(song, previous.history)
            .then((continuationTracks) => {
              if (!continuationTracks || continuationTracks.length === 0) return;
              setSession((curr) => {
                if (
                  curr.playbackSource === "mahi_select" ||
                  curr.playbackSource === "custom_playlist" ||
                  isIsolatedPlaybackContext(curr.queueSource, curr.playbackSource)
                ) {
                  return curr;
                }

                const existingIds = new Set(
                  curr.queue.map((q) => (q.id || "").replace(/^yt-/, "").trim().toLowerCase())
                );
                const fresh = continuationTracks.filter(
                  (t) => !existingIds.has((t.id || "").replace(/^yt-/, "").trim().toLowerCase())
                );
                if (fresh.length === 0) return curr;

                const extendedQueue = [...curr.queue, ...fresh];
                const extendedOriginal = dedupeSongs([...curr.originalQueue, ...fresh]);

                playbackEvents.emit("QUEUE_CHANGE", {
                  queue: extendedQueue,
                  source: curr.queueSource,
                  reason: "autoplay",
                });

                return {
                  ...curr,
                  queue: extendedQueue,
                  originalQueue: extendedOriginal,
                };
              });
            })
            .catch((err) => console.warn("Continuation fetch notice:", err));
        }

        return {
          ...previous,
          currentIndex: nextIndex,
          history: previousSong
            ? [...previous.history, previousSong.id].slice(-100)
            : previous.history,
        };
      });
    },
    [activateSong, catalogue, repeat, autoplayEnabled, shuffle],
  );

  const next = useCallback(() => step(1, false), [step]);
  const previous = useCallback(() => step(-1, false), [step]);

  // YouTube IFrame Player integration & event listeners
  useEffect(() => {
    youtubePlayerBridge.init("mevo-youtube-iframe-container");

    const unsubscribeState = youtubePlayerBridge.onStateChange((state) => {
      const activeSong = currentRef.current;
      if (!activeSong || !isYouTubeSong(activeSong)) return;

      if (state === "playing") {
        setPlaying(true);
        setIsBuffering(false);
        const ytDuration = youtubePlayerBridge.getDuration();
        if (ytDuration > 0) {
          setDuration(ytDuration);
        }
      } else if (state === "paused") {
        setPlaying(false);
        setIsBuffering(false);
      } else if (state === "buffering") {
        setIsBuffering(true);
        playbackEvents.emit("BUFFERING", { buffering: true });
      } else if (state === "ended") {
        setIsBuffering(false);
        recordTrackCompleted(activeSong);

        const shouldLogActivity = settings.showListeningActivity && !settings.privateSession;
        if (shouldLogActivity) {
          void recordPlay(activeSong.id, duration || activeSong.duration, true);
          recordSongPlayedTimestamp(activeSong.id);
        }

        if (repeatRef.current === "one") {
          youtubePlayerBridge.seek(0);
          setProgress(0);
          youtubePlayerBridge.play();
          return;
        }

        step(1, true);
      }
    });

    const unsubscribeError = youtubePlayerBridge.onError((error) => {
      const failedSong = currentRef.current;
      if (!failedSong || !isYouTubeSong(failedSong)) return;
      setIsBuffering(false);
      console.warn("[YouTube Player] Playback error code:", error);
      if (error === 101 || error === 150 || error?.data === 101 || error?.data === 150) {
        setPlaybackError(`"${failedSong.title}" is restricted from embedding by YouTube/owner. Advancing...`);
        setTimeout(() => step(1, true), 1500);
      }
    });

    return () => {
      unsubscribeState();
      unsubscribeError();
    };
  }, [step, settings.showListeningActivity, settings.privateSession, duration]);

  // YouTube playback progress polling (~4x/sec)
  useEffect(() => {
    if (!current || !isYouTubeSong(current) || !isPlaying) return;

    const interval = setInterval(() => {
      const currentTime = youtubePlayerBridge.getCurrentTime();
      const currentDuration = youtubePlayerBridge.getDuration();

      if (currentDuration > 0) {
        setDuration(currentDuration);
      }

      if (currentTime > 0 || isPlaying) {
        setProgress(currentTime);
        trackListenedSecondsRef.current = currentTime;

        const now = performance.now();
        if (now - lastTimeEventRef.current > 500) {
          lastTimeEventRef.current = now;
          playbackEvents.emit("TIME_UPDATE", {
            currentTime,
            duration: currentDuration || duration || current.duration || 0,
          });
          if (current) {
            recordTrackProgress(current, currentTime, currentDuration || duration || current.duration || 0);
          }
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [current, isPlaying, duration]);

  const toggle = useCallback(() => {
    if (!current) {
      const first = catalogue[0];
      if (first) play(first);
      return;
    }
    setPlaying((value) => {
      const nextState = !value;
      if (isYouTubeSong(current)) {
        if (nextState) {
          youtubePlayerBridge.play();
        } else {
          youtubePlayerBridge.pause();
        }
      }
      playbackEvents.emit(
        nextState ? "PLAY" : "PAUSE",
        nextState ? { song: current } : { song: current },
      );
      return nextState;
    });
  }, [catalogue, current, play]);

  const toggleShuffle = useCallback(() => {
    setShuffle((enabled) => {
      const nextEnabled = !enabled;
      shufflePlayedIdsRef.current = new Set();
      playbackEvents.emit("SHUFFLE", { enabled: nextEnabled });
      return nextEnabled;
    });
  }, []);

  // Synchronize Audio Track Source & Playback State
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!current) {
      audio.pause();
      audio.removeAttribute("src");
      delete audio.dataset.songId;
      audio.load();
      youtubePlayerBridge.stop();
      setProgress(0);
      return;
    }

    // YouTube playback path: handled via YouTubePlayerBridge to bypass 403 & bot blocks
    if (isYouTubeSong(current)) {
      audio.pause();
      audio.removeAttribute("src");
      delete audio.dataset.songId;

      const cleanId = extractYouTubeVideoId(current.id);
      if (current.duration && current.duration > 0) {
        setDuration(current.duration);
      }

      const activeYtId = youtubePlayerBridge.getCurrentVideoId();
      if (activeYtId !== cleanId) {
        setProgress(0);
        youtubePlayerBridge.loadVideo(cleanId, isPlaying);
      } else {
        if (isPlaying) {
          youtubePlayerBridge.play();
        } else {
          youtubePlayerBridge.pause();
        }
      }

      // MediaSession API Sync for lock-screen & mobile media controls
      if (typeof window !== "undefined" && "mediaSession" in navigator) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: current.title,
            artist: current.artist,
            album: current.album || "MEVO",
            artwork: [
              { src: current.cover, sizes: "96x96", type: "image/jpeg" },
              { src: current.cover, sizes: "128x128", type: "image/jpeg" },
              { src: current.cover, sizes: "192x192", type: "image/jpeg" },
              { src: current.cover, sizes: "256x256", type: "image/jpeg" },
              { src: current.cover, sizes: "384x384", type: "image/jpeg" },
              { src: current.cover, sizes: "512x512", type: "image/jpeg" },
            ],
          });
          navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
        } catch {
          // Ignore unsupported MediaSession attributes
        }
      }
      return;
    }

    // Non-YouTube path (Local / Supabase / B2 upload)
    youtubePlayerBridge.pause();

    let audioSrc = current.audio;
    if (!audioSrc || !audioSrc.startsWith("http")) {
      audioSrc = getYouTubeStreamUrl(current.id);
    }

    if (!audioSrc) {
      audio.pause();
      setPlaying(false);
      setPlaybackError(`No audio source available for "${current.title}".`);
      return;
    }

    const isNewTrack = audio.dataset.songId !== current.id || audio.src !== audioSrc;
    if (isNewTrack) {
      audio.dataset.songId = current.id;
      audio.pause();
      audio.src = audioSrc;
      audio.currentTime = 0;
      setProgress(0);
      audio.load();
    }

    if (isPlaying) {
      void executePlay();
    } else {
      audio.pause();
    }

    // MediaSession API Sync for lock-screen & mobile media controls
    if (typeof window !== "undefined" && "mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: current.title,
          artist: current.artist,
          album: current.album || "MEVO",
          artwork: [
            { src: current.cover, sizes: "96x96", type: "image/jpeg" },
            { src: current.cover, sizes: "128x128", type: "image/jpeg" },
            { src: current.cover, sizes: "192x192", type: "image/jpeg" },
            { src: current.cover, sizes: "256x256", type: "image/jpeg" },
            { src: current.cover, sizes: "384x384", type: "image/jpeg" },
            { src: current.cover, sizes: "512x512", type: "image/jpeg" },
          ],
        });
        navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
      } catch {
        // Ignore unsupported MediaSession attributes
      }
    }
  }, [current, isPlaying, executePlay]);

  const seek = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds)) return;
    const activeSong = currentRef.current;
    if (activeSong && isYouTubeSong(activeSong)) {
      youtubePlayerBridge.seek(seconds);
    } else {
      const audio = audioRef.current;
      if (audio) {
        audio.currentTime = seconds;
      }
    }
    setProgress(seconds);
    playbackEvents.emit("SEEK", { seconds });
  }, []);

  // Hook MediaSession Action Handlers
  useEffect(() => {
    if (typeof window === "undefined" || !("mediaSession" in navigator)) return;

    const actionHandlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => setPlaying(true)],
      ["pause", () => setPlaying(false)],
      ["previoustrack", () => previous()],
      ["nexttrack", () => next()],
      [
        "seekto",
        (details) => {
          if (details.seekTime != null && Number.isFinite(details.seekTime)) {
            seek(details.seekTime);
          }
        },
      ],
    ];

    for (const [action, handler] of actionHandlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Ignore unsupported actions
      }
    }

    return () => {
      for (const [action] of actionHandlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [next, previous, seek]);

  const setVolume = useCallback((nextVolume: number) => {
    const clamped = Math.max(0, Math.min(1, nextVolume));
    setVolumeState(clamped);
    if (clamped > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted((value) => !value), []);

  const toggleRepeat = useCallback(() => {
    setRepeat((value) => {
      const nextMode: RepeatMode = value === "default" ? "one" : "default";
      playbackEvents.emit("REPEAT", { mode: nextMode });
      return nextMode;
    });
  }, []);

  const cycleRepeat = toggleRepeat;

  const toggleLike = useCallback(
    (songOrId: string | Song, fallbackSong?: Song) => {
      const id = typeof songOrId === "string" ? songOrId : songOrId.id;
      const targetSong =
        typeof songOrId === "object"
          ? songOrId
          : fallbackSong ??
            catalogue.find((s) => s.id === id) ??
            session.queue.find((s) => s.id === id) ??
            (current?.id === id ? current : null);

      setLikes((previous) => {
        const nextLikes = previous.includes(id)
          ? previous.filter((item) => item !== id)
          : [...previous, id];

        try {
          window.localStorage.setItem(LIKES_KEY, JSON.stringify(nextLikes));
        } catch (error) {
          console.error("Could not persist likes to storage:", error);
        }

        return nextLikes;
      });

      if (targetSong) {
        setFavoriteSongs((previous) => {
          const isFavorited = previous.some((s) => s.id === targetSong.id);
          const nextFavs = isFavorited
            ? previous.filter((s) => s.id !== targetSong.id)
            : [targetSong, ...previous];

          try {
            window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(nextFavs));
          } catch (error) {
            console.error("Could not persist favorites to storage:", error);
          }

          return nextFavs;
        });
      }
    },
    [catalogue, session.queue, current],
  );

  const isLiked = useCallback((id: string) => likes.includes(id), [likes]);

  const value: PlayerState = useMemo(
    () => ({
      current,
      catalogue,
      originalQueue: session.originalQueue,
      queue: session.queue,
      queueIds: session.queue.map((song) => song.id),
      currentIndex: session.currentIndex,
      queueSource: session.queueSource,
      navigationSource: session.navigationSource,
      playbackSource: session.playbackSource,
      history: session.history,
      isPlaying,
      volume,
      muted,
      shuffle,
      repeat,
      likes,
      favoriteSongs,
      recent,
      play,
      playFromCollection,
      playNewQueue,
      playFromCurrentQueue,
      playQueueIndex,
      ensureQueueContainsSong,
      playNext,
      addToQueue,
      appendSongsToQueue,
      removeFromQueue,
      clearQueue,
      reorderQueue,
      toggle,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      toggleRepeat,
      toggleLike,
      isLiked,
      playerVisible,
      hidePlayer,
      isBuffering,
      playbackError,
      autoplayEnabled,
      toggleAutoplay,
    }),
    [
      current,
      catalogue,
      session,
      isPlaying,
      volume,
      muted,
      shuffle,
      repeat,
      likes,
      favoriteSongs,
      recent,
      play,
      playFromCollection,
      playNewQueue,
      playFromCurrentQueue,
      playQueueIndex,
      ensureQueueContainsSong,
      playNext,
      addToQueue,
      appendSongsToQueue,
      removeFromQueue,
      clearQueue,
      reorderQueue,
      toggle,
      next,
      previous,
      seek,
      setVolume,
      toggleMute,
      toggleShuffle,
      cycleRepeat,
      toggleRepeat,
      toggleLike,
      isLiked,
      playerVisible,
      hidePlayer,
      isBuffering,
      playbackError,
      autoplayEnabled,
      toggleAutoplay,
    ],
  );

  // Artwork Preloading for Next & Prev tracks
  useEffect(() => {
    if (typeof window === "undefined") return;
    const neighbours = [
      session.queue[session.currentIndex + 1],
      session.queue[session.currentIndex - 1],
    ].filter(Boolean) as Song[];

    for (const song of neighbours) {
      if (song.cover && !song.cover.startsWith("data:")) {
        const img = new Image();
        img.decoding = "async";
        img.src = song.cover;
      }
    }
  }, [session.queue, session.currentIndex]);

  const progressValue: PlayerProgressState = useMemo(
    () => ({ progress, duration }),
    [progress, duration],
  );

  return (
    <PlayerContext.Provider value={value}>
      <PlayerProgressContext.Provider value={progressValue}>
        {children}
        {/* Dedicated YouTube IFrame Player bridge for official, unblocked browser playback */}
        <div
          className="pointer-events-none fixed -top-[9999px] -left-[9999px] h-[1px] w-[1px] opacity-0 overflow-hidden"
          aria-hidden="true"
        >
          <div id="mevo-youtube-iframe-container" />
        </div>
        {/* Single Dedicated HTMLAudioElement instance rendered in React DOM tree */}
        <audio
          ref={audioRef}
          preload={settings.gaplessPlayback ? "auto" : "metadata"}
          onTimeUpdate={(event) => {
            const currentTime = event.currentTarget.currentTime;
            const currentDuration = event.currentTarget.duration;
            setProgress(currentTime);
            trackListenedSecondsRef.current = currentTime;

            const now = performance.now();
            if (now - lastTimeEventRef.current > 500) {
              lastTimeEventRef.current = now;
              playbackEvents.emit("TIME_UPDATE", { currentTime, duration: currentDuration });
              if (current) {
                recordTrackProgress(current, currentTime, currentDuration);
              }
            }
          }}
          onLoadedMetadata={(event) => {
            const dur = event.currentTarget.duration;
            if (Number.isFinite(dur) && dur > 0) {
              setDuration(dur);
            }
          }}
          onPlay={() => {
            setPlaying(true);
            setIsBuffering(false);
          }}
          onPause={() => {
            setPlaying(false);
          }}
          onWaiting={() => {
            setIsBuffering(true);
            playbackEvents.emit("BUFFERING", { buffering: true });
          }}
          onPlaying={() => {
            setIsBuffering(false);
            playbackEvents.emit("BUFFERING", { buffering: false });
          }}
          onCanPlay={() => {
            setIsBuffering(false);
          }}
          onError={() => {
            const failedSong = current;
            setIsBuffering(false);
            setPlaying(false);

            const message = failedSong?.title
              ? `Couldn't play "${failedSong.title}". Please check audio source or try another track.`
              : "Audio source is currently unavailable.";

            setPlaybackError(message);
            playbackEvents.emit("ERROR", {
              message,
              songId: failedSong?.id ?? null,
              recoverable: false,
            });
          }}
          onEnded={() => {
            const endedSong = current;
            const audioEl = audioRef.current;
            if (!audioEl || !endedSong || audioEl.currentTime <= 0) {
              return;
            }

            // User taste completion tracking
            recordTrackCompleted(endedSong);

            const shouldLogActivity = settings.showListeningActivity && !settings.privateSession;
            if (shouldLogActivity) {
              void recordPlay(endedSong.id, duration || endedSong.duration, true);
              recordSongPlayedTimestamp(endedSong.id);
            }

            if (repeatRef.current === "one") {
              // Replay current track from the beginning
              audioEl.currentTime = 0;
              setProgress(0);
              audioEl.play().catch((err) => {
                console.warn("Single track repeat play notice:", err);
                void executePlay();
              });
              return; // PREVENT advancing to next track
            }

            // Default behavior: advance to next song in queue
            step(1, true);
          }}
        />
      </PlayerProgressContext.Provider>
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used inside PlayerProvider");
  return context;
}

/** Subscribes only to currentTime/duration — updates ~4x/sec during playback. */
export function usePlayerProgress() {
  return useContext(PlayerProgressContext);
}
