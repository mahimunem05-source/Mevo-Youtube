import { AnimatePresence, motion } from "motion/react";
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  ListMusic,
  ChevronDown,
  ChevronUp,
  Volume2,
  Volume1,
  VolumeX,
  Repeat,
  Repeat1,
} from "lucide-react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { usePlayer } from "@/lib/player-context";
import { useNavigationHistory } from "@/lib/navigation-history";
import { useSettings } from "@/context/SettingsContext";
import { SeekBar } from "./seek-bar";
import { useState, useCallback, memo } from "react";
import { cn } from "@/lib/utils";
import { DEFAULT_COVER, isYouTubeSong } from "@/data/songs";

/**
 * Bottom playback bar — premium floating dock with a hide/show handle.
 *
 * Handle behaviour:
 * - Tapping the pill handle smoothly slides the player body downward (collapsed).
 * - Only the handle stays visible at the bottom of the screen in collapsed state.
 * - Tapping again restores the player with a smooth ease-out slide-up.
 * - Playback, song, progress, queue are completely unaffected by collapse/expand.
 * - State is remembered for the current browser session via sessionStorage.
 *
 * Visibility rules:
 * - Hidden on first visit until a song is played.
 * - Restored automatically on refresh/return with the last song.
 * - Hidden while the current track's own page (/song/$songId) is open.
 */

const SESSION_KEY = "mevo-player-collapsed";

function BottomPlayerComponent() {
  const p = usePlayer();
  const { settings } = useSettings();
  const isCompact = settings.compactPlayer;
  const song = p.current;
  const navigate = useNavigate();
  const { recordPlayerSource } = useNavigationHistory();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isFullPlayerOpen = Boolean(song) && pathname === `/song/${song?.id}`;
  const show = Boolean(song) && p.playerVisible && !isFullPlayerOpen;

  // Collapsed state — persisted for the session so it survives navigation
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggleCollapsed = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    setCollapsed((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(SESSION_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const openFullPlayer = () => {
    if (!song) return;
    recordPlayerSource();
    void navigate({ to: "/song/$songId", params: { songId: song.id } });
  };

  return (
    <AnimatePresence>
      {show && song && (
        <motion.div
          key="bottom-player"
          initial={{ y: 96, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 96, opacity: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 z-50 pointer-events-none"
          style={{ bottom: "calc(6px + env(safe-area-inset-bottom, 0px))" }}
        >
          <div className="relative mx-auto max-w-2xl lg:max-w-3xl px-3 md:px-4 lg:px-6">
            {/* ── Handle pill ──────────────────────────────────────────────
                Positioned at bottom-center when collapsed (calc(6px + safe-area)),
                attached to the top-center edge of the player when expanded.
            ─────────────────────────────────────────────────────────────── */}
            <motion.div
              animate={{
                bottom: collapsed ? 0 : "100%",
                y: collapsed ? 0 : 6,
              }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-auto"
            >
              <button
                type="button"
                aria-label={collapsed ? "Show player" : "Hide player"}
                onClick={toggleCollapsed}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggleCollapsed(e);
                  }
                }}
                /* 44px tall invisible touch area, centred on the 16px pill */
                className="relative flex h-[44px] w-[44px] cursor-pointer items-center justify-center"
              >
                {/* Visual pill */}
                <span
                  className="absolute flex h-4 w-[30px] items-center justify-center rounded-full"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(30,43,49,0.98) 0%, rgba(24,34,39,0.98) 100%)",
                    border: "1px solid rgba(79,209,197,0.18)",
                    boxShadow: "0 -1px 8px rgba(79,209,197,0.08), 0 2px 8px rgba(0,0,0,0.40)",
                  }}
                >
                  <motion.span
                    animate={{ rotate: collapsed ? 0 : 180 }}
                    transition={{ duration: 0.25, ease: "easeOut" }}
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    {collapsed ? (
                      <ChevronUp className="h-2.5 w-2.5 text-[#4FD1C5]/80" />
                    ) : (
                      <ChevronDown className="h-2.5 w-2.5 text-[#4FD1C5]/80" />
                    )}
                  </motion.span>
                </span>
              </button>
            </motion.div>

            {/* ── Player body ──────────────────────────────────────────────
                Slides down out of view when collapsed.
            ─────────────────────────────────────────────────────────────── */}
            <motion.div
              animate={{
                y: collapsed ? 84 : 0,
                opacity: collapsed ? 0 : 1,
              }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              style={{
                willChange: "transform, opacity",
                transform: "translate3d(0,0,0)",
                backfaceVisibility: "hidden",
              }}
              className={collapsed ? "pointer-events-none" : "pointer-events-auto"}
            >
              <div
                role="button"
                tabIndex={0}
                aria-label={`Open full player for ${song.title}`}
                onClick={openFullPlayer}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openFullPlayer();
                  }
                }}
                className={cn(
                  "relative mx-auto flex max-w-2xl lg:max-w-3xl cursor-pointer items-center rounded-2xl transition-all",
                  isCompact
                    ? "gap-2 px-2.5 py-1.5 sm:gap-3 sm:px-3.5 sm:py-2.5 lg:px-4 lg:py-2.5"
                    : "gap-2.5 px-3 py-2 sm:gap-3 sm:px-3.5 sm:py-2.5 lg:px-4 lg:py-2.5",
                )}
                style={{
                  background:
                    "linear-gradient(135deg, rgba(30,43,49,0.98) 0%, rgba(24,34,39,0.98) 100%)",
                  transform: "translateZ(0)",
                  WebkitTransform: "translateZ(0)",
                  backfaceVisibility: "hidden",
                  border: "1px solid rgba(79,209,197,0.12)",
                  borderTop: "1px solid rgba(79,209,197,0.18)",
                  boxShadow: [
                    "0 -2px 20px rgba(79,209,197,0.06)",
                    "0 8px 32px rgba(0,0,0,0.55)",
                    "0 2px 8px rgba(0,0,0,0.40)",
                    "inset 0 1px 0 rgba(255,255,255,0.04)",
                  ].join(", "),
                }}
              >
                {/* Album artwork — smooth crossfade */}
                <AnimatePresence mode="wait">
                  <motion.img
                    key={song.cover}
                    src={song.cover || DEFAULT_COVER}
                    alt=""
                    loading="eager"
                    decoding="auto"
                    width={36}
                    height={36}
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (target.src !== DEFAULT_COVER) {
                        target.src = DEFAULT_COVER;
                      }
                    }}
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.94 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className={cn(
                      "shrink-0 rounded-lg object-cover ring-1 ring-white/10 shadow-md transition-all",
                      isYouTubeSong(song)
                        ? (isCompact ? "h-7 w-12 sm:h-9 sm:w-16 aspect-video" : "h-9 w-16 aspect-video")
                        : (isCompact ? "h-7 w-7 sm:h-9 sm:w-9 aspect-square" : "h-9 w-9 aspect-square"),
                    )}
                  />
                </AnimatePresence>

                {/* Song info + progress bar — smooth text crossfade */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={song.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="min-w-0 flex-1"
                  >
                    <div
                      className={cn(
                        "truncate font-semibold leading-tight text-white/95 transition-all",
                        isCompact ? "text-xs sm:text-[13px]" : "text-[13px]",
                      )}
                    >
                      {song.title}
                    </div>
                    <div
                      className={cn(
                        "truncate font-normal text-[#4FD1C5]/70 transition-all",
                        isCompact ? "text-[9px] sm:text-[10px]" : "text-[10px]",
                      )}
                    >
                      {song.artist}
                    </div>
                    {/* Progress bar — always visible */}
                    <SeekBar size="compact" className={isCompact ? "mt-0.5 sm:mt-1" : "mt-1"} />
                  </motion.div>
                </AnimatePresence>

                {/* Transport controls */}
                <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                  <motion.button
                    type="button"
                    aria-label="Previous"
                    whileTap={{ scale: 0.9 }}
                    whileHover={{ scale: 1.05 }}
                    onClick={(event) => {
                      event.stopPropagation();
                      p.previous();
                    }}
                    className={cn(
                      "grid place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
                      isCompact ? "h-6 w-6 sm:h-7 sm:w-7" : "h-7 w-7",
                    )}
                  >
                    <SkipBack className={isCompact ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : "h-3.5 w-3.5"} />
                  </motion.button>

                  {/* Cyan play/pause button with subtle pop spring */}
                  <div className="relative">
                    {p.isPlaying && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 rounded-full animate-ping"
                        style={{
                          background: "transparent",
                          boxShadow: "0 0 0 0 rgba(79,209,197,0.45)",
                          animation: "player-ring-pulse 2.4s ease-out infinite",
                        }}
                      />
                    )}
                    <motion.button
                      type="button"
                      aria-label={p.isPlaying ? "Pause" : "Play"}
                      whileTap={{ scale: 0.88 }}
                      whileHover={{ scale: 1.05 }}
                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                      onClick={(event) => {
                        event.stopPropagation();
                        p.toggle();
                      }}
                      className={cn(
                        "relative grid place-items-center rounded-full text-[#071012] transition-transform",
                        isCompact ? "h-7 w-7 sm:h-8 sm:w-8" : "h-8 w-8",
                      )}
                      style={{
                        background: "linear-gradient(135deg, #4FD1C5 0%, #38B2AC 100%)",
                        boxShadow: "0 2px 10px rgba(79,209,197,0.35)",
                      }}
                    >
                      {p.isPlaying ? (
                        <Pause
                          className={
                            isCompact
                              ? "h-3 w-3 sm:h-3.5 sm:w-3.5 fill-current"
                              : "h-3.5 w-3.5 fill-current"
                          }
                        />
                      ) : (
                        <Play
                          className={
                            isCompact
                              ? "h-3 w-3 sm:h-3.5 sm:w-3.5 fill-current translate-x-0.5"
                              : "h-3.5 w-3.5 fill-current translate-x-0.5"
                          }
                        />
                      )}
                    </motion.button>
                  </div>

                  <motion.button
                    type="button"
                    aria-label="Next"
                    whileTap={{ scale: 0.9 }}
                    whileHover={{ scale: 1.05 }}
                    onClick={(event) => {
                      event.stopPropagation();
                      p.next();
                    }}
                    className={cn(
                      "grid place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
                      isCompact ? "h-6 w-6 sm:h-7 sm:w-7" : "h-7 w-7",
                    )}
                  >
                    <SkipForward
                      className={isCompact ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : "h-3.5 w-3.5"}
                    />
                  </motion.button>

                  {/* Repeat button */}
                  <motion.button
                    type="button"
                    aria-label={`Repeat: ${p.repeat === "one" ? "Repeat One" : "Continuous Queue"}`}
                    title={`Repeat: ${p.repeat === "one" ? "Repeat One" : "Continuous Queue"}`}
                    whileTap={{ scale: 0.9 }}
                    whileHover={{ scale: 1.05 }}
                    onClick={(event) => {
                      event.stopPropagation();
                      p.toggleRepeat();
                    }}
                    className={cn(
                      "grid place-items-center rounded-full transition-colors cursor-pointer text-teal-400 drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]",
                      isCompact ? "h-6 w-6 sm:h-7 sm:w-7" : "h-7 w-7",
                    )}
                  >
                    {p.repeat === "one" ? (
                      <Repeat1 className={isCompact ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : "h-3.5 w-3.5"} />
                    ) : (
                      <Repeat className={isCompact ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : "h-3.5 w-3.5"} />
                    )}
                  </motion.button>

                  {/* Queue icon */}
                  <motion.button
                    type="button"
                    aria-label="Open queue"
                    whileTap={{ scale: 0.95 }}
                    onClick={(event) => {
                      event.stopPropagation();
                      openFullPlayer();
                    }}
                    className={cn(
                      "grid place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
                      isCompact ? "h-6 w-6 sm:h-7 sm:w-7" : "h-7 w-7",
                    )}
                  >
                    <ListMusic
                      className={isCompact ? "h-3 w-3 sm:h-3.5 sm:w-3.5" : "h-3.5 w-3.5"}
                    />
                  </motion.button>

                  {/* Desktop Volume Slider (lg: and above only) */}
                  <div
                    className="hidden lg:flex items-center gap-1.5 pl-2 ml-1 border-l border-white/10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={p.toggleMute}
                      aria-label={p.muted || p.volume === 0 ? "Unmute" : "Mute"}
                      className="grid size-6 place-items-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {p.muted || p.volume === 0 ? (
                        <VolumeX className="size-3 text-red-400" />
                      ) : p.volume < 0.5 ? (
                        <Volume1 className="size-3 text-teal-400/90" />
                      ) : (
                        <Volume2 className="size-3 text-teal-400" />
                      )}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={p.muted ? 0 : p.volume}
                      onChange={(e) => p.setVolume(parseFloat(e.target.value))}
                      aria-label="Volume slider"
                      className="w-14 xl:w-18 h-1 bg-[#182227] rounded-full appearance-none cursor-pointer accent-[#4FD1C5]"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const BottomPlayer = memo(BottomPlayerComponent);
