import { memo } from "react";
import { Play, Pause } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import type { Section, Song } from "@/data/songs";
import {
  useSmartMusicDashboard,
  type UseSmartMusicDashboardOptions,
} from "@/hooks/useSmartMusicDashboard";
import { SongCoverImage } from "./song-cover-image";

export interface HeroBannerProps {
  songs?: Song[];
  manualSongs?: Song[];
  catalogue?: Song[];
  sections?: Section[];
  songsBySection?: Record<string, Song[]>;
  label?: string;
  autoRotate?: boolean;
  intervalSeconds?: number;
}

/**
 * Featured Dashboard Music Banner.
 * - Multi-section guarantee: Picks exactly 1 song from each section (N sections = N dots).
 * - 3-shift daily rotation based on GMT+6 Bangladesh Time (Morning, Afternoon, Night).
 * - Dynamic 5s slide timer with synchronized epoch rotation.
 * - Smooth active/inactive dot indicators, background blur, title, artist, and Play button.
 */
function HeroBannerComponent({
  songs: propSongs,
  manualSongs,
  catalogue,
  sections,
  songsBySection,
  label: labelOverride,
  autoRotate = true,
  intervalSeconds = 5,
}: HeroBannerProps) {
  const dashboardOptions: UseSmartMusicDashboardOptions = {
    catalogue,
    sections,
    songsBySection,
    manualSongs: manualSongs || (propSongs && propSongs.length > 0 ? propSongs : undefined),
    slideIntervalSeconds: intervalSeconds || 5,
    autoRotate,
    labelOverride,
  };

  const {
    currentSong,
    songs,
    activeIndex,
    setActiveIndex,
    headerLabel,
    isPlayingNow,
    handlePlayNow,
    containerProps,
  } = useSmartMusicDashboard(dashboardOptions);

  if (!currentSong || songs.length === 0) {
    return null;
  }

  return (
    <div
      data-hero-banner="true"
      className="px-3 sm:px-6 md:px-12 select-none max-w-7xl mx-auto"
      {...containerProps}
    >
      <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl border border-slate-200/90 dark:border-white/[0.08] shadow-xl shadow-slate-200/50 dark:shadow-2xl min-h-[190px] lg:min-h-[250px] xl:min-h-[280px] bg-slate-900">
        {/* Cover art background with ambient blur and gradient overlays */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSong.id}
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
            className="absolute inset-0 z-0 h-full w-full overflow-hidden"
          >
            {/* Ambient blurred background layer */}
            <div
              aria-hidden="true"
              className="absolute inset-0 scale-110 blur-2xl opacity-40"
              style={{
                backgroundImage: `url(${currentSong.cover})`,
                backgroundPosition: "center",
                backgroundSize: "cover",
              }}
            />

            {/* Crisp foreground cover image */}
            <SongCoverImage
              src={currentSong.cover}
              alt=""
              aria-hidden="true"
              width={800}
              height={450}
              loading="eager"
              decoding="auto"
              className="h-full w-full object-cover object-center brightness-100"
              draggable={false}
            />

            {/* Directional gradient overlay — dark on left for high-contrast text, smooth fade on right */}
            <div className="absolute inset-0 z-10 bg-gradient-to-r from-black/90 via-black/50 to-transparent dark:from-black/95 dark:via-black/55 dark:to-transparent" />

            {/* Subtle bottom vignette for carousel indicators */}
            <div className="absolute inset-x-0 bottom-0 h-16 z-10 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" />
          </motion.div>
        </AnimatePresence>

        {/* Content Overlay */}
        <div className="relative z-10 flex flex-col justify-between p-4 sm:p-6 lg:p-8 min-h-[190px] lg:min-h-[250px] xl:min-h-[280px]">
          {/* Top: Dynamic Shift Badge + Song Title & Artist */}
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-xs font-extrabold tracking-[0.2em] uppercase text-teal-400 drop-shadow-sm">
                {headerLabel}
              </span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentSong.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              >
                <h2
                  className="mt-1 font-display text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-extrabold leading-tight tracking-tight text-white line-clamp-1 text-always-white"
                  style={{
                    color: "#ffffff",
                    textShadow: "0 2px 16px rgba(0, 0, 0, 0.85)",
                  }}
                >
                  {currentSong.title}
                </h2>
                <p
                  className="mt-0.5 text-xs sm:text-sm lg:text-base text-white/80 font-medium text-always-white"
                  style={{
                    color: "rgba(255, 255, 255, 0.85)",
                    textShadow: "0 1px 8px rgba(0, 0, 0, 0.7)",
                  }}
                >
                  {currentSong.artist}
                  {currentSong.category ? ` • ${currentSong.category}` : ""}
                </p>
              </motion.div>
            </AnimatePresence>

            {/* Play/Pause Button */}
            <div className="mt-4 lg:mt-6 flex items-center">
              <motion.button
                type="button"
                aria-label={
                  isPlayingNow ? `Pause ${currentSong.title}` : `Play ${currentSong.title}`
                }
                onClick={handlePlayNow}
                whileTap={{ scale: 0.96 }}
                whileHover={{ scale: 1.02 }}
                className="flex items-center gap-2 rounded-full bg-[#4FD1C5] px-5 py-2 lg:px-6 lg:py-2.5 text-xs sm:text-sm lg:text-base font-extrabold text-[#071012] shadow-[0_0_20px_rgba(79,209,197,0.4)] transition-all hover:bg-[#4FD1C5]/90 cursor-pointer"
              >
                {isPlayingNow ? (
                  <Pause className="h-4 w-4 lg:h-5 lg:w-5 fill-current" />
                ) : (
                  <Play className="h-4 w-4 lg:h-5 lg:w-5 fill-current translate-x-0.5" />
                )}
                <span>{isPlayingNow ? "Playing" : "Play Now"}</span>
              </motion.button>
            </div>
          </div>

          {/* Bottom: Smooth Active/Inactive Dot Indicators (Exact count = songs.length) */}
          {songs.length > 1 && (
            <div
              className="mt-4 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1"
              aria-label="Dashboard banner carousel pagination"
            >
              {songs.map((s, idx) => {
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={`${s.id}-${idx}`}
                    type="button"
                    aria-label={`Go to slide ${idx + 1}: ${s.title}`}
                    onClick={() => setActiveIndex(idx)}
                    className="rounded-full transition-all duration-300 cursor-pointer shrink-0"
                    style={{
                      width: isActive ? "24px" : "6px",
                      height: "6px",
                      backgroundColor: isActive ? "#4FD1C5" : "rgba(255, 255, 255, 0.3)",
                      boxShadow: isActive ? "0 0 10px rgba(79, 209, 197, 0.6)" : "none",
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const HeroBanner = memo(HeroBannerComponent);
