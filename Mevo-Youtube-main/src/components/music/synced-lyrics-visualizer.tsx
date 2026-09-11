import React, { memo, useEffect, useRef, useState } from "react";
import { Music2 } from "lucide-react";
import { usePlayer, usePlayerProgress } from "@/lib/player-context";
import type { LyricLine } from "@/services/lyricsService";
import { cn } from "@/lib/utils";

export interface SyncedLyricsVisualizerProps {
  lines: LyricLine[];
  className?: string;
}

export const SyncedLyricsVisualizer = memo(function SyncedLyricsVisualizer({
  lines,
  className,
}: SyncedLyricsVisualizerProps) {
  const { progress: currentTime } = usePlayerProgress();
  const { seek } = usePlayer();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const userScrollTimeoutRef = useRef<number | null>(null);
  const lastProgressRef = useRef(currentTime);

  // Auto-reset user scrolling if user performs a seek (>1.5s leap in currentTime)
  useEffect(() => {
    if (Math.abs(currentTime - lastProgressRef.current) > 1.5) {
      setIsUserScrolling(false);
    }
    lastProgressRef.current = currentTime;
  }, [currentTime]);

  const firstLineTime = lines && lines.length > 0 ? lines[0].time : 0;
  // 1. Intro Check: If playback is before first vocal line (- 1.5s lead-in)
  const isIntro = currentTime < Math.max(0, firstLineTime - 1.5);

  // 2. Derive active line strictly from player currentTime (zero timer-drift)
  let activeIndex = -1;
  if (!isIntro && lines && lines.length > 0) {
    for (let i = 0; i < lines.length; i++) {
      if (currentTime >= lines[i].time) {
        activeIndex = i;
      } else {
        break;
      }
    }
  }

  // 3. Instrumental Break Detection: Identify gaps >= 4.5s between consecutive lines
  let isInstrumentalBreak = false;
  if (!isIntro && activeIndex >= 0 && lines) {
    const currentLine = lines[activeIndex];
    const nextLine = lines[activeIndex + 1];

    if (nextLine) {
      const lineDuration = currentLine.duration || Math.min(6.0, nextLine.time - currentLine.time);
      const lineEndTime = currentLine.time + lineDuration;
      const gap = nextLine.time - lineEndTime;

      // If gap is large, vocal phrase ended, and playback is not yet within 1.5s of next line
      if (gap >= 4.5 && currentTime > lineEndTime + 0.3 && currentTime < nextLine.time - 1.2) {
        isInstrumentalBreak = true;
      }
    }
  }

  // 4. Smooth auto-scroll to keep active line centered without clipping
  useEffect(() => {
    if (isUserScrolling || isIntro || activeIndex < 0 || !activeLineRef.current || !containerRef.current) {
      return;
    }

    const container = containerRef.current;
    const activeEl = activeLineRef.current;
    const containerHeight = container.clientHeight;
    const lineOffsetTop = activeEl.offsetTop;
    const lineHeight = activeEl.offsetHeight;

    const targetScrollTop = lineOffsetTop - containerHeight / 2 + lineHeight / 2;

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: "smooth",
    });
  }, [activeIndex, isUserScrolling, isIntro]);

  const handleUserScroll = () => {
    setIsUserScrolling(true);
    if (userScrollTimeoutRef.current) {
      window.clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = window.setTimeout(() => {
      setIsUserScrolling(false);
    }, 2500);
  };

  const handleLineClick = (time: number) => {
    seek(time);
    setIsUserScrolling(false);
  };

  if (!lines || lines.length === 0) {
    return null;
  }

  return (
    <div className={cn("relative flex size-full flex-col overflow-hidden select-none", className)}>
      {/* ── INTRO STATE (Before Vocals Drop) ─────────────────────────────────── */}
      {isIntro ? (
        <div className="relative flex size-full flex-col items-center justify-center text-center transition-opacity duration-300 ease-out px-4">
          <div className="flex flex-col items-center justify-center gap-2">
            {/* Pulsing audio beat indicator */}
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-teal-400 animate-ping" />
              <span className="size-2 rounded-full bg-teal-300 animate-pulse delay-100" />
              <span className="size-2 rounded-full bg-teal-200 animate-pulse delay-200" />
            </div>

            <div className="flex items-center gap-1.5 text-teal-300/90 font-black tracking-widest text-[11px] uppercase">
              <Music2 className="size-3 text-teal-300 animate-bounce" />
              <span>Instrumental Intro</span>
            </div>

            <p className="text-[10px] text-white/40 font-medium">
              Vocals start in {Math.max(1, Math.ceil(firstLineTime - currentTime))}s
            </p>
          </div>
        </div>
      ) : (
        /* ── SYNCHRONIZED SCROLLING LYRICS STATE ────────────────────────────── */
        <div
          ref={containerRef}
          onScroll={handleUserScroll}
          className={cn(
            "relative flex size-full flex-col overflow-y-auto px-2 sm:px-4 py-2 no-scrollbar text-center transform-gpu will-change-transform overscroll-contain",
            "[mask-image:linear-gradient(to_bottom,transparent_0%,black_16%,black_84%,transparent_100%)]",
          )}
        >
          {/* Dynamic flexible column: spacing between lines prevents any text collisions */}
          <div className="my-auto flex flex-col gap-3 py-10 w-full max-w-full">
            {lines.map((line, idx) => {
              const isActive = idx === activeIndex && !isInstrumentalBreak;
              const isPassed = idx < activeIndex;

              return (
                <div
                  key={`${line.time}-${idx}`}
                  ref={idx === activeIndex ? activeLineRef : null}
                  className="w-full max-w-full flex flex-col items-center justify-center transition-all duration-300"
                >
                  <div
                    onClick={() => handleLineClick(line.time)}
                    className={cn(
                      "group relative cursor-pointer w-full max-w-full px-3 py-1.5 rounded-xl transition-all duration-300 transform-gpu",
                      "break-words whitespace-normal leading-relaxed text-center",
                      isActive
                        ? "text-teal-300 font-extrabold text-[12.5px] sm:text-[13.5px] drop-shadow-[0_0_12px_rgba(79,209,197,0.7)] bg-teal-500/10 border border-teal-500/20"
                        : isPassed
                          ? "text-white/35 text-[11px] sm:text-xs font-medium hover:text-white/70"
                          : "text-white/55 text-[11px] sm:text-xs font-medium hover:text-white/85",
                    )}
                  >
                    <span className="relative inline-block max-w-full break-words">
                      {line.text}
                    </span>
                  </div>

                  {/* Instrumental Break Pulse between large vocal pauses */}
                  {idx === activeIndex && isInstrumentalBreak && (
                    <div className="mt-2.5 flex items-center justify-center gap-1.5 py-1 animate-fade-in">
                      <span className="size-1.5 rounded-full bg-teal-400 animate-pulse" />
                      <span className="size-1.5 rounded-full bg-teal-300 animate-pulse delay-150" />
                      <span className="size-1.5 rounded-full bg-teal-200 animate-pulse delay-300" />
                      <span className="text-[9px] uppercase tracking-widest text-teal-400/75 font-bold ml-1.5">
                        Interlude
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});
