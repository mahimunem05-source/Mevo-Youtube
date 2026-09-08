import React, { memo, useEffect, useRef, useState } from "react";
import { Music2, Sparkles, Zap } from "lucide-react";
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

  const firstLineTime = lines.length > 0 ? lines[0].time : 0;
  // 1. Intro Check: If before first vocal line (- 1.5s)
  const isIntro = currentTime < Math.max(0, firstLineTime - 1.5);

  // 2. Find active line index based on current playback timestamp
  let activeIndex = -1;
  if (!isIntro) {
    for (let i = 0; i < lines.length; i++) {
      if (currentTime >= lines[i].time) {
        activeIndex = i;
      } else {
        break;
      }
    }
  }

  // 3. Instrumental Break Check: Detect gaps > 5s between lines
  let isInstrumentalBreak = false;
  if (!isIntro && activeIndex >= 0) {
    const currentLine = lines[activeIndex];
    const nextLine = lines[activeIndex + 1];

    if (nextLine) {
      const lineDuration = currentLine.duration || Math.min(5.5, nextLine.time - currentLine.time);
      const lineEndTime = currentLine.time + lineDuration;
      const gap = nextLine.time - lineEndTime;

      // If gap is large and current playback has passed the sung line and is not yet within 1.5s of next line
      if (gap >= 5.0 && currentTime > lineEndTime + 0.5 && currentTime < nextLine.time - 1.5) {
        isInstrumentalBreak = true;
      }
    }
  }

  // Smooth auto-scroll to keep current line centered
  useEffect(() => {
    if (isUserScrolling || isIntro || activeIndex < 0 || !activeLineRef.current || !containerRef.current) {
      return;
    }

    const container = containerRef.current;
    const activeEl = activeLineRef.current;
    const containerHeight = container.clientHeight;
    const lineOffsetTop = activeEl.offsetTop;
    const lineHeight = activeEl.clientHeight;

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
        <div className="relative flex size-full flex-col items-center justify-center text-center transition-opacity duration-400 ease-in-out px-4">
          <div className="flex flex-col items-center justify-center gap-2">
            {/* Pulsing audio beat dots */}
            <div className="flex items-center gap-2">
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
            "relative flex size-full flex-col overflow-y-auto px-4 py-4 no-scrollbar text-center transform-gpu will-change-transform overscroll-contain",
            "[mask-image:linear-gradient(to_bottom,transparent_0%,black_18%,black_82%,transparent_100%)]",
          )}
        >
          <div className="my-auto space-y-2.5 py-12">
            {lines.map((line, idx) => {
              const isActive = idx === activeIndex && !isInstrumentalBreak;
              const isPassed = idx < activeIndex;

              return (
                <div key={`${line.time}-${idx}`}>
                  <div
                    ref={idx === activeIndex ? activeLineRef : null}
                    onClick={() => handleLineClick(line.time)}
                    className={cn(
                      "group relative cursor-pointer px-2 py-1 rounded-xl transition-all duration-400 transform-gpu leading-relaxed",
                      isActive
                        ? "text-teal-300 font-extrabold text-[13px] sm:text-sm scale-105 opacity-100 drop-shadow-[0_0_10px_rgba(79,209,197,0.6)]"
                        : isPassed
                          ? "text-white/30 text-[11px] sm:text-xs font-medium opacity-60 hover:opacity-100 hover:text-white/70"
                          : "text-white/50 text-[11px] sm:text-xs font-medium opacity-75 hover:opacity-100 hover:text-white/80",
                    )}
                  >
                    <span className="relative inline-block transition-transform duration-200 group-hover:scale-105">
                      {line.text}
                    </span>
                  </div>

                  {/* Instrumental Break Pulse between large gaps */}
                  {idx === activeIndex && isInstrumentalBreak && (
                    <div className="my-2 flex items-center justify-center gap-1.5 py-1 animate-fade-in">
                      <span className="size-1.5 rounded-full bg-teal-400 animate-pulse" />
                      <span className="size-1.5 rounded-full bg-teal-300 animate-pulse delay-150" />
                      <span className="size-1.5 rounded-full bg-teal-200 animate-pulse delay-300" />
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
