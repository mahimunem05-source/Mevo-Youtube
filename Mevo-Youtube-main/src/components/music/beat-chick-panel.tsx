import { memo, useState, useMemo, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import { HumanCartoonDancer } from "@/components/music/human-cartoon-dancer";
import {
  X,
  Sparkles,
  Heart,
  Play,
  Pause,
  Layers,
  Activity,
  Users,
  Zap,
  Flame,
  Music2,
} from "lucide-react";
import { toast } from "sonner";
import type { Song } from "@/data/songs";
import { usePlayer } from "@/lib/player-context";
import { SeekBar } from "@/components/music/seek-bar";
import { SongCoverImage } from "@/components/music/song-cover-image";
import { cn } from "@/lib/utils";

interface BeatChickPanelProps {
  song: Song | null;
  onClose: () => void;
}

type BgMode = "dark" | "aura" | "pulse";
type SyncMode = "groove" | "pulse" | "chill";

const STAGE_EQ_CLASSES = [
  "animate-eq-1",
  "animate-eq-3",
  "animate-eq-5",
  "animate-eq-2",
  "animate-eq-4",
  "animate-eq-1",
  "animate-eq-3",
  "animate-eq-5",
  "animate-eq-2",
  "animate-eq-4",
  "animate-eq-1",
  "animate-eq-3",
  "animate-eq-5",
  "animate-eq-2",
  "animate-eq-4",
];

/** Calculate safe musical insights from song metadata */
function getSongInsights(song: Song | null) {
  if (!song) {
    return { bpm: 92, mood: "Chill", energy: "65%" };
  }

  const seed = (song.id + song.title).split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);

  const bpmOptions = [78, 84, 92, 98, 105, 114, 122, 128, 132];
  const bpm = bpmOptions[seed % bpmOptions.length];

  const genreLower = (song.genre || "").toLowerCase();
  let mood = "Chill";
  let energyPct = 60 + (seed % 35);

  if (
    genreLower.includes("beat") ||
    genreLower.includes("dance") ||
    genreLower.includes("pop") ||
    genreLower.includes("edm")
  ) {
    mood = "Energetic";
    energyPct = Math.max(75, energyPct);
  } else if (
    genreLower.includes("acoustic") ||
    genreLower.includes("folk") ||
    genreLower.includes("rabindra") ||
    genreLower.includes("classical")
  ) {
    mood = "Soulful";
    energyPct = Math.min(65, 45 + (seed % 20));
  } else if (genreLower.includes("hindi") || genreLower.includes("soft")) {
    mood = "Vibrant";
  } else if (genreLower.includes("global") || genreLower.includes("rock")) {
    mood = "Euphoric";
  }

  return {
    bpm,
    mood,
    energy: `${energyPct}%`,
  };
}

/** Memoized Mascot Stage — Animated Stylish Human Cartoon Dancer */
const MascotStage = memo(function MascotStage({
  isPlaying,
  syncMode = "groove",
  bpm = 120,
  particlesEnabled,
}: {
  isPlaying: boolean;
  syncMode?: SyncMode;
  bpm?: number;
  particlesEnabled: boolean;
  bgMode?: BgMode;
}) {
  const shadowAnimClass = useMemo(() => {
    if (!isPlaying) return "scale-90 opacity-40";
    if (syncMode === "groove") return "animate-shadow-groove";
    if (syncMode === "pulse") return "animate-shadow-pulse";
    return "animate-shadow-chill";
  }, [isPlaying, syncMode]);

  return (
    <div className="relative flex flex-col items-center justify-center py-3 select-none">
      {/* Glowing teal backdrop pulsing on beat */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-52 rounded-full bg-teal-500/20 blur-2xl transition-all duration-500 will-change-transform",
          isPlaying ? "scale-125 opacity-90" : "scale-95 opacity-40",
        )}
      />

      {/* Dynamic floor shadow underneath that scales/pulses with dance */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute bottom-4 size-44 rounded-full bg-teal-400/25 blur-xl will-change-transform",
          shadowAnimClass,
        )}
      />

      {/* Glowing pedestal ellipse */}
      <div className="absolute bottom-5 h-6 w-40 rounded-[100%] bg-gradient-to-r from-teal-500/20 via-teal-400/40 to-teal-500/20 border border-teal-400/30 blur-xs pointer-events-none" />

      {/* Floating Particles & Music Notes — Pure GPU CSS */}
      {particlesEnabled && isPlaying && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <span className="absolute left-[22%] bottom-[25%] text-teal-300 font-bold text-xs select-none animate-particle-left">
            ♪
          </span>
          <span className="absolute left-[76%] bottom-[25%] text-teal-300 font-bold text-xs select-none animate-particle-right">
            ♫
          </span>
          <span className="absolute left-[48%] bottom-[25%] text-teal-300 font-bold text-xs select-none animate-particle-center">
            ♬
          </span>
          <span className="absolute left-[34%] bottom-[25%] text-teal-400/80 font-bold text-[10px] select-none animate-particle-left">
            •
          </span>
          <span className="absolute left-[66%] bottom-[25%] text-teal-400/80 font-bold text-[10px] select-none animate-particle-right">
            •
          </span>
        </div>
      )}

      {/* Dynamic Equalizer Visualizer Bars — Pure GPU scaleY */}
      <div className="absolute bottom-2 flex items-end justify-center gap-1.5 w-full px-8 pointer-events-none h-12">
        {STAGE_EQ_CLASSES.map((animClass, i) => (
          <span
            key={`stage-eq-${i}`}
            className={cn(
              "w-1 h-full rounded-full bg-gradient-to-t from-teal-700 via-teal-400 to-teal-200 origin-bottom will-change-transform",
              isPlaying ? animClass : "scale-y-[0.15] opacity-25",
            )}
          />
        ))}
      </div>

      {/* ── STYLISH HUMAN-LIKE CARTOON DANCER ── */}
      <HumanCartoonDancer isPlaying={isPlaying} bpm={bpm} className="relative z-10" />
    </div>
  );
});

/** Memoized Current Song Card */
const CurrentSongCard = memo(function CurrentSongCard({ song }: { song: Song | null }) {
  const player = usePlayer();
  const currentSong = player.current ?? song;
  const isPlaying = player.isPlaying;
  const isLiked = currentSong ? player.isLiked(currentSong.id) : false;

  if (!currentSong) return null;

  return (
    <div className="rounded-2xl border border-[#26373E] bg-[#111A1E]/90 p-3.5 shadow-xl backdrop-blur-md">
      <div className="flex items-center gap-3">
        <div className="size-12 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10 shadow">
          <SongCoverImage
            src={currentSong.cover}
            alt=""
            width={48}
            height={48}
            className="size-full object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-xs font-bold text-white">{currentSong.title}</h3>
            {currentSong.genre && (
              <span className="shrink-0 rounded-md bg-teal-500/15 px-1.5 py-0.5 text-[9px] font-bold text-teal-300 border border-teal-500/20">
                {currentSong.genre}
              </span>
            )}
          </div>
          <p className="truncate text-[11px] font-medium text-teal-400 mt-0.5">
            {currentSong.artist}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => player.toggleLike(currentSong)}
            aria-label={isLiked ? "Unlike" : "Like"}
            className="grid size-8 place-items-center rounded-full text-teal-400 hover:text-teal-300 transition-colors active:scale-90 cursor-pointer"
          >
            <Heart
              className={cn(
                "size-4 transition-colors",
                isLiked ? "fill-teal-400 text-teal-400" : "text-teal-400/70",
              )}
            />
          </button>

          <button
            type="button"
            onClick={() => player.toggle()}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="grid size-8 place-items-center rounded-full bg-[#4FD1C5] text-[#071012] shadow-[0_0_12px_rgba(79,209,197,0.35)] transition-all hover:bg-[#4FD1C5]/90 active:scale-90 cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="size-3.5 fill-current" />
            ) : (
              <Play className="size-3.5 translate-x-0.5 fill-current" />
            )}
          </button>
        </div>
      </div>

      {/* Progress Seek Bar */}
      <div className="mt-3">
        <SeekBar size="compact" />
      </div>
    </div>
  );
});

/** Memoized Music Insights */
const MusicInsights = memo(function MusicInsights({
  insights,
}: {
  insights: { bpm: number; mood: string; energy: string };
}) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <div className="flex flex-col items-center justify-center rounded-2xl border border-[#233339] bg-[#0E1518]/90 py-2.5 px-2 text-center shadow-md">
        <span className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-teal-400/80">
          <Activity className="size-3 text-teal-400" />
          BPM
        </span>
        <span className="mt-1 text-sm font-black text-white">{insights.bpm}</span>
        <span className="text-[9px] text-white/50">Rhythm Tempo</span>
      </div>

      <div className="flex flex-col items-center justify-center rounded-2xl border border-[#233339] bg-[#0E1518]/90 py-2.5 px-2 text-center shadow-md">
        <span className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-teal-400/80">
          <Music2 className="size-3 text-teal-400" />
          MOOD
        </span>
        <span className="mt-1 text-sm font-black text-white">{insights.mood}</span>
        <span className="text-[9px] text-white/50">Sonic Vibe</span>
      </div>

      <div className="flex flex-col items-center justify-center rounded-2xl border border-[#233339] bg-[#0E1518]/90 py-2.5 px-2 text-center shadow-md">
        <span className="flex items-center gap-1 text-[9px] font-extrabold uppercase tracking-wider text-teal-400/80">
          <Flame className="size-3 text-teal-400" />
          ENERGY
        </span>
        <span className="mt-1 text-sm font-black text-teal-300">{insights.energy}</span>
        <span className="text-[9px] text-white/50">Dynamic Level</span>
      </div>
    </div>
  );
});

export const BeatChickPanel = memo(function BeatChickPanel({ song, onClose }: BeatChickPanelProps) {
  const player = usePlayer();
  const currentSong = player.current ?? song;
  const isPlaying = player.isPlaying;

  // Feature states
  const [particlesEnabled, setParticlesEnabled] = useState(true);
  const [bgMode, setBgMode] = useState<BgMode>("dark");
  const [syncMode, setSyncMode] = useState<SyncMode>("groove");

  const insights = useMemo(() => getSongInsights(currentSong), [currentSong]);

  // Safe background scroll lock
  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalTouchAction = document.body.style.touchAction;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.touchAction = originalTouchAction;
    };
  }, []);

  // Handle buddy toggle
  const handleChangeBuddy = useCallback(() => {
    toast.custom(() => (
      <div className="flex items-center gap-3 rounded-2xl border border-teal-500/30 bg-[#0F171A] px-4 py-3 text-white shadow-2xl backdrop-blur-md">
        <img src="/beat-chick.png" alt="" className="size-8 object-contain" />
        <div className="text-xs">
          <p className="font-bold text-teal-300">Beat Chick is Active!</p>
          <p className="text-white/70 text-[11px]">
            VIP mascot companion is locked in. More buddies arriving soon!
          </p>
        </div>
      </div>
    ));
  }, []);

  // Cycle Background Mode
  const cycleBackground = useCallback(() => {
    setBgMode((prev) => {
      if (prev === "dark") return "aura";
      if (prev === "aura") return "pulse";
      return "dark";
    });
  }, []);

  // Cycle Sync Mode
  const cycleSyncMode = useCallback(() => {
    setSyncMode((prev) => {
      if (prev === "groove") return "pulse";
      if (prev === "pulse") return "chill";
      return "groove";
    });
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* ── BACKDROP (Zero Repaints) ────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
      />

      {/* ── PANEL CONTAINER (Native GPU Transform Slide Up/Down) ──────────── */}
      <motion.div
        initial={{ transform: "translate3d(0, 100%, 0)" }}
        animate={{ transform: "translate3d(0, 0%, 0)" }}
        exit={{ transform: "translate3d(0, 100%, 0)" }}
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        style={{ willChange: "transform" }}
        className={cn(
          "relative z-10 mx-auto flex h-[92vh] max-h-[860px] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border-t border-x border-[#2A3B42] text-white shadow-[0_-12px_40px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-colors duration-300 select-none",
          bgMode === "dark" && "bg-[#0A1013]",
          bgMode === "aura" && "bg-gradient-to-b from-[#0A181D] via-[#091114] to-[#070C0E]",
          bgMode === "pulse" && "bg-gradient-to-b from-[#09151A] via-[#090F12] to-[#060A0C]",
        )}
      >
        {/* Dynamic Background Static Lighting */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 -z-10 transition-opacity duration-300",
            bgMode === "dark" && "opacity-30",
            bgMode === "aura" && "opacity-75",
            bgMode === "pulse" && "opacity-60",
          )}
        >
          <div className="absolute left-1/2 top-1/4 -translate-x-1/2 -translate-y-1/2 size-72 rounded-full bg-teal-400/20 blur-[70px]" />
          {bgMode === "aura" && (
            <div className="absolute left-1/2 top-1/3 -translate-x-1/2 size-96 rounded-full bg-teal-300/15 blur-[90px]" />
          )}
        </div>

        {/* ── TOP DRAG HANDLE & HEADER ─────────────────────────────────────── */}
        <div className="shrink-0 px-5 pt-3 pb-2 border-b border-white/[0.06]">
          <div className="mx-auto mb-2.5 h-1 w-11 rounded-full bg-white/20" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-full bg-teal-950/80 border border-teal-500/40 p-1 shadow-inner">
                <img
                  src="/beat-chick.png"
                  alt="Beat Chick"
                  width={32}
                  height={32}
                  className="size-full object-contain pointer-events-none select-none"
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-xs font-black tracking-[0.2em] uppercase text-white">
                    BEAT CHICK
                  </h2>
                  <span className="rounded-full bg-teal-400/20 px-1.5 py-0.5 text-[9px] font-bold text-teal-300 border border-teal-400/30">
                    COMPANION
                  </span>
                </div>
                <p className="text-[10px] text-teal-400/80 font-medium">
                  Feel the beat, feel the vibe!
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Beat Chick panel"
              className="grid size-8 place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white cursor-pointer active:scale-95 touch-manipulation"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* ── SCROLLABLE PANEL CONTENT ─────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-5 py-3 no-scrollbar space-y-4 touch-manipulation">
          {/* 1. CENTER BEAT CHICK STAGE */}
          <MascotStage
            isPlaying={isPlaying}
            syncMode={syncMode}
            bpm={insights.bpm}
            particlesEnabled={particlesEnabled}
            bgMode={bgMode}
          />

          {/* 2. CURRENT SONG CARD */}
          <CurrentSongCard song={currentSong} />

          {/* 3. MUSIC INSIGHTS */}
          <MusicInsights insights={insights} />

          {/* 4. FOUR INTERACTIVE FEATURE BUTTONS */}
          <div className="grid grid-cols-2 gap-2.5 pt-1 pb-4">
            {/* 1. Change Buddy */}
            <button
              type="button"
              onClick={handleChangeBuddy}
              className="flex items-center gap-2.5 rounded-2xl border border-[#26373E] bg-[#111A1E]/90 p-2.5 text-left transition-all hover:border-teal-500/40 hover:bg-[#152026] active:scale-[0.98] cursor-pointer touch-manipulation"
            >
              <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-teal-500/15 text-teal-300 border border-teal-500/25">
                <Users className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-extrabold text-white">Change Buddy</p>
                <p className="truncate text-[9px] text-teal-400">Beat Chick (VIP)</p>
              </div>
            </button>

            {/* 2. Particles */}
            <button
              type="button"
              onClick={() => setParticlesEnabled((prev) => !prev)}
              className={cn(
                "flex items-center gap-2.5 rounded-2xl border p-2.5 text-left transition-all active:scale-[0.98] cursor-pointer touch-manipulation",
                particlesEnabled
                  ? "border-teal-500/40 bg-teal-500/10 text-white shadow-[0_0_15px_rgba(79,209,197,0.12)]"
                  : "border-[#26373E] bg-[#111A1E]/90 text-white/70 hover:border-white/20",
              )}
            >
              <div
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-xl border",
                  particlesEnabled
                    ? "bg-teal-400 text-[#071012] border-teal-300"
                    : "bg-white/5 text-white/50 border-white/10",
                )}
              >
                <Sparkles className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-extrabold text-white">Particles</p>
                <p className="truncate text-[9px] text-teal-400">
                  {particlesEnabled ? "Active" : "Off"}
                </p>
              </div>
            </button>

            {/* 3. Background */}
            <button
              type="button"
              onClick={cycleBackground}
              className="flex items-center gap-2.5 rounded-2xl border border-[#26373E] bg-[#111A1E]/90 p-2.5 text-left transition-all hover:border-teal-500/40 hover:bg-[#152026] active:scale-[0.98] cursor-pointer touch-manipulation"
            >
              <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-teal-500/15 text-teal-300 border border-teal-500/25">
                <Layers className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-extrabold text-white">Background</p>
                <p className="truncate text-[9px] text-teal-400 uppercase">
                  {bgMode === "dark" ? "Default" : bgMode === "aura" ? "Cyan Aura" : "Pulse Wave"}
                </p>
              </div>
            </button>

            {/* 4. Sync Mode */}
            <button
              type="button"
              onClick={cycleSyncMode}
              className="flex items-center gap-2.5 rounded-2xl border border-[#26373E] bg-[#111A1E]/90 p-2.5 text-left transition-all hover:border-teal-500/40 hover:bg-[#152026] active:scale-[0.98] cursor-pointer touch-manipulation"
            >
              <div className="grid size-8 shrink-0 place-items-center rounded-xl bg-teal-500/15 text-teal-300 border border-teal-500/25">
                <Zap className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-extrabold text-white">Sync Mode</p>
                <p className="truncate text-[9px] text-teal-400 uppercase">{syncMode}</p>
              </div>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
});
