import { memo, useEffect, useRef } from "react";
import { getLiveMultiBandLevels } from "@/lib/multi-band-audio";
import { isUserFastScrolling } from "@/lib/scroll-performance";
import { cn } from "@/lib/utils";

export interface AudioReactiveChickProps {
  isPlaying: boolean;
  isVisible?: boolean;
  bpm?: number;
  className?: string;
}

export const AudioReactiveChick = memo(function AudioReactiveChick({
  isPlaying,
  isVisible = true,
  bpm = 120,
  className,
}: AudioReactiveChickProps) {
  // ── HOOKS (Strictly top-level, unconditional) ─────────────────────────────
  const chickContainerRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  // Smooth Ambient Kinematics State
  const stateRef = useRef({
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
    glowOpacity: 0.3,
    glowScale: 1,
    shadowScale: 1,
    shadowOpacity: 0.4,
  });

  useEffect(() => {
    let animId: number | null = null;
    let isCancelled = false;

    const renderLoop = (timeMs: number) => {
      if (isCancelled) return;

      // Skip DOM & filter writes during active scrolling or when element is offscreen
      if (isVisible === false || isUserFastScrolling()) {
        animId = requestAnimationFrame(renderLoop);
        return;
      }

      const t = timeMs / 1000;
      const live = getLiveMultiBandLevels(isPlaying, timeMs);
      const state = stateRef.current;

      let targetX = 0;
      let targetY = 0;
      let targetScale = 1;
      let targetRotate = 0;
      let targetGlowOpacity = 0.3;
      let targetGlowScale = 1;
      let targetShadowScale = 1;
      let targetShadowOpacity = 0.4;

      if (isPlaying) {
        // --- 1. SLOW & SMOOTH LEFT-TO-RIGHT GLIDING (3.8s - 4.8s Stage Walk) ---
        const glidePeriod = 4.4;
        const glidePhase = (t / glidePeriod) * Math.PI * 2;

        const rawGlide = Math.sin(glidePhase);
        const smoothGlide = Math.sign(rawGlide) * Math.pow(Math.abs(rawGlide), 0.85);
        targetX = smoothGlide * 20.0;

        // --- 2. GENTLE DIRECTIONAL TILT ---
        const glideVelocity = Math.cos(glidePhase);
        targetRotate = glideVelocity * 3.2;

        // --- 3. SUBTLE, NON-AGGRESSIVE VERTICAL HOVERING ---
        const floatWave = Math.sin(t * 2.4) * 1.8;
        const gentleBass = live.bass * 2.8;
        targetY = -3.2 + floatWave - gentleBass;

        // --- 4. GENTLE BREATHING / PULSE SCALING ---
        const breathingPulse = Math.sin(t * 1.8) * 0.015;
        const bassPulse = live.bass * 0.025;
        targetScale = 1.0 + breathingPulse + bassPulse;

        // --- 5. SHADOW & AMBIENT GLOW PROXIMITY SYNC ---
        const eqProximity = Math.min(1.0, Math.abs(state.x) / 20.0);
        targetGlowOpacity = 0.28 + eqProximity * 0.18 + live.bass * 0.22;
        targetGlowScale = 1.0 + eqProximity * 0.14 + live.bass * 0.12;

        const altitude = Math.max(0, -state.y);
        targetShadowScale = Math.max(0.65, 1.08 - altitude * 0.04);
        targetShadowOpacity = Math.max(0.22, 0.65 - altitude * 0.035);
      } else {
        // --- 6. PAUSED STATE: SEAMLESS CENTERED IDLE FLOAT ---
        targetX = 0;
        const idleBreath = Math.sin(t * 1.4);
        targetY = -2.0 + idleBreath * 1.8;
        targetScale = 1.0 + idleBreath * 0.012;
        targetRotate = Math.sin(t * 0.9) * 0.8;

        targetGlowOpacity = 0.24 + idleBreath * 0.05;
        targetGlowScale = 0.96 + idleBreath * 0.04;
        targetShadowScale = 1.0 - idleBreath * 0.05;
        targetShadowOpacity = 0.38 + idleBreath * 0.04;
      }

      // --- 7. FLUID LERP INTERPOLATION ---
      const lerpX = isPlaying ? 0.08 : 0.05;
      const lerpY = isPlaying ? 0.12 : 0.06;
      const lerpScale = isPlaying ? 0.14 : 0.06;
      const lerpRot = isPlaying ? 0.09 : 0.05;

      state.x += (targetX - state.x) * lerpX;
      state.y += (targetY - state.y) * lerpY;
      state.scale += (targetScale - state.scale) * lerpScale;
      state.rotate += (targetRotate - state.rotate) * lerpRot;

      state.glowOpacity += (targetGlowOpacity - state.glowOpacity) * 0.1;
      state.glowScale += (targetGlowScale - state.glowScale) * 0.1;
      state.shadowScale += (targetShadowScale - state.shadowScale) * 0.12;
      state.shadowOpacity += (targetShadowOpacity - state.shadowOpacity) * 0.12;

      // Apply direct GPU transforms with null guards
      if (chickContainerRef.current) {
        chickContainerRef.current.style.transform = `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0) scale(${state.scale.toFixed(3)}) rotate(${state.rotate.toFixed(2)}deg)`;
      }

      if (shadowRef.current) {
        shadowRef.current.style.transform = `translate3d(${state.x.toFixed(2)}px, 0, 0) scale(${state.shadowScale.toFixed(3)})`;
        shadowRef.current.style.opacity = `${state.shadowOpacity.toFixed(2)}`;
      }

      if (glowRef.current) {
        glowRef.current.style.transform = `translate(calc(-50% + ${state.x.toFixed(2)}px), -50%) scale(${state.glowScale.toFixed(3)})`;
        glowRef.current.style.opacity = `${state.glowOpacity.toFixed(2)}`;
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
  }, [isPlaying, bpm, isVisible]);

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center shrink-0 pointer-events-none select-none bg-transparent border-0 outline-none shadow-none overflow-visible",
        className,
      )}
    >
      {/* Ambient Audio-Reactive Teal Glow Aura (Glides with Chick) - Soft, borderless radial glow */}
      <div
        ref={glowRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(45,212,191,0.30)_0%,rgba(45,212,191,0.10)_45%,transparent_70%)] blur-lg will-change-transform"
      />

      {/* Dynamic Soft Contact Shadow (Glides with Chick) */}
      <div
        ref={shadowRef}
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-1 size-16 -translate-x-1/2 left-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.6)_0%,transparent_70%)] blur-xs will-change-transform"
      />

      {/* Subtle floating music notes on active playback */}
      {isPlaying && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-1 -left-2 text-[10px] text-teal-300 select-none font-bold animate-particle-left"
          >
            ♪
          </span>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-2 -right-2 text-[10px] text-teal-300 select-none font-bold animate-particle-right"
          >
            ♫
          </span>
        </>
      )}

      {/* Ultra-Smooth Gliding Beat Chick Mascot */}
      <div
        ref={chickContainerRef}
        className="relative z-10 size-20 flex items-center justify-center will-change-transform origin-bottom filter drop-shadow-[0_6px_14px_rgba(0,0,0,0.6)]"
      >
        <img
          src="/beat-chick.png"
          alt="Beat Chick Mascot"
          width={80}
          height={80}
          loading="eager"
          decoding="async"
          className="size-full object-contain pointer-events-none select-none bg-transparent border-0 outline-none shadow-none"
        />
      </div>
    </div>
  );
});

export default AudioReactiveChick;
