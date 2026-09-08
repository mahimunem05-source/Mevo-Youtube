import React, { memo, useEffect, useRef } from "react";
import { getLiveMultiBandLevels } from "@/lib/multi-band-audio";
import { cn } from "@/lib/utils";

export interface MultiBandVisualizerProps {
  isPlaying: boolean;
  side?: "left" | "right";
  className?: string;
}

export const MultiBandVisualizer = memo(function MultiBandVisualizer({
  isPlaying,
  side = "left",
  className,
}: MultiBandVisualizerProps) {
  // ── HOOKS (Strictly top-level, unconditional) ─────────────────────────────
  const bassBarRef = useRef<HTMLDivElement>(null);
  const vocalBarRef = useRef<HTMLDivElement>(null);
  const trebleBarRef = useRef<HTMLDivElement>(null);
  const treblePeakRef = useRef<HTMLSpanElement>(null);
  const bassGlowRef = useRef<HTMLDivElement>(null);

  // Filter lerp smoothing values
  const currentLevels = useRef({
    bass: 0.1,
    vocal: 0.1,
    treble: 0.1,
  });

  useEffect(() => {
    let animId: number | null = null;
    let isCancelled = false;
    const isLeft = side === "left";

    const renderLoop = (timeMs: number) => {
      if (isCancelled) return;

      // 1. Fetch live multi-band audio frequency levels
      const live = getLiveMultiBandLevels(isPlaying, timeMs);

      // Stereo phase adjustment for left vs right
      const targetBass = isPlaying
        ? Math.max(0.12, Math.min(1.0, live.bass * (isLeft ? 1.0 : 0.94)))
        : 0.08;
      const targetVocal = isPlaying
        ? Math.max(0.14, Math.min(1.0, live.vocal * (isLeft ? 0.95 : 1.05)))
        : 0.08;
      const targetTreble = isPlaying
        ? Math.max(0.1, Math.min(1.0, live.treble * (isLeft ? 1.05 : 0.92)))
        : 0.06;

      // 2. Exponential Lerp Smoothing
      const cur = currentLevels.current;
      cur.bass += (targetBass - cur.bass) * (isPlaying ? 0.32 : 0.1);
      cur.vocal += (targetVocal - cur.vocal) * (isPlaying ? 0.18 : 0.08);
      cur.treble += (targetTreble - cur.treble) * (isPlaying ? 0.48 : 0.12);

      // 3. Direct GPU transform updates (safe null guards)
      if (bassBarRef.current) {
        const bassScale = Math.max(0.1, Math.min(1.0, cur.bass));
        bassBarRef.current.style.transform = `scaleY(${bassScale})`;
      }

      if (vocalBarRef.current) {
        const vocalScale = Math.max(0.1, Math.min(1.0, cur.vocal));
        vocalBarRef.current.style.transform = `scaleY(${vocalScale})`;
      }

      if (trebleBarRef.current) {
        const trebleScale = Math.max(0.08, Math.min(1.0, cur.treble));
        trebleBarRef.current.style.transform = `scaleY(${trebleScale})`;
      }

      // Treble micro-spike peak light
      if (treblePeakRef.current) {
        const opacity = isPlaying ? Math.min(1.0, cur.treble * 1.6) : 0.2;
        treblePeakRef.current.style.opacity = `${opacity}`;
      }

      // Bass punch drop glow
      if (bassGlowRef.current) {
        const glowOpacity = isPlaying ? Math.max(0.1, cur.bass * 0.75) : 0.05;
        bassGlowRef.current.style.opacity = `${glowOpacity}`;
      }

      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);

    return () => {
      isCancelled = true;
      if (animId !== null) {
        cancelAnimationFrame(animId);
      }
    };
  }, [isPlaying, side]);

  return (
    <div
      className={cn(
        "relative flex h-20 items-end gap-1.5 select-none pointer-events-none px-1",
        side === "right" ? "justify-end flex-row-reverse" : "justify-start flex-row",
        className,
      )}
    >
      {/* ── 1. BASS BAR (~20Hz - 250Hz Sub/Kick) ────────────────────────── */}
      <div className="group/bar relative flex flex-col items-center h-full justify-end w-2.5">
        {/* Punchy Drop Glow Backdrop */}
        <div
          ref={bassGlowRef}
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-16 rounded-full bg-teal-400 blur-sm transition-opacity pointer-events-none opacity-20"
        />

        {/* Bass Bar Pillar */}
        <div
          ref={bassBarRef}
          style={{ transform: "scaleY(0.15)" }}
          className="w-full h-full rounded-full bg-gradient-to-t from-teal-800 via-teal-400 to-[#00F5FF] shadow-[0_0_8px_rgba(0,245,255,0.6)] origin-bottom will-change-transform"
        />

        {/* Band Label Pill */}
        <span className="mt-1 text-[7px] font-black tracking-tighter text-teal-400/90 uppercase">
          BAS
        </span>
      </div>

      {/* ── 2. VOCAL / MIDS BAR (~250Hz - 4kHz Lead Vocals & Melody) ─────── */}
      <div className="group/bar relative flex flex-col items-center h-full justify-end w-2">
        {/* Vocal Wave Pillar */}
        <div
          ref={vocalBarRef}
          style={{ transform: "scaleY(0.15)" }}
          className="w-full h-full rounded-full bg-gradient-to-t from-teal-900/90 via-sky-400 to-teal-300 shadow-[0_0_6px_rgba(56,189,248,0.5)] origin-bottom will-change-transform"
        />

        {/* Band Label Pill */}
        <span className="mt-1 text-[7px] font-black tracking-tighter text-sky-400/80 uppercase">
          VOC
        </span>
      </div>

      {/* ── 3. TREBLE / HIGHS BAR (~4kHz - 20kHz Hi-Hats & Micro Details) ── */}
      <div className="group/bar relative flex flex-col items-center h-full justify-end w-1.5">
        {/* Treble Micro-Spike Peak Sparkle */}
        <span
          ref={treblePeakRef}
          className="absolute -top-1 size-1 rounded-full bg-white shadow-[0_0_6px_#FFFFFF] opacity-40 will-change-opacity"
        />

        {/* Treble Bar Pillar */}
        <div
          ref={trebleBarRef}
          style={{ transform: "scaleY(0.1)" }}
          className="w-full h-full rounded-full bg-gradient-to-t from-teal-900/80 via-teal-300 to-white shadow-[0_0_5px_rgba(255,255,255,0.7)] origin-bottom will-change-transform"
        />

        {/* Band Label Pill */}
        <span className="mt-1 text-[7px] font-black tracking-tighter text-teal-200/70 uppercase">
          TRB
        </span>
      </div>
    </div>
  );
});

export default MultiBandVisualizer;
