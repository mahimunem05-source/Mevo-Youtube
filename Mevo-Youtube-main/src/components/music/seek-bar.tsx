import { useCallback, useEffect, useRef, useState } from "react";

import { usePlayer, usePlayerProgress } from "@/lib/player-context";
import { cn } from "@/lib/utils";

/**
 * Shared playback timeline.
 *
 * It owns no audio: it reads `progress`/`duration` from the existing
 * PlayerProgressContext (fed by the single global <audio> element in
 * player-context) and writes back through the existing `seek()` action,
 * which already emits the SEEK playback event. That's why the bottom
 * mini-player and the song page stay in sync automatically — both render
 * this component against the same context.
 */

/** 42 -> "0:42", 287 -> "4:47", anything invalid -> "0:00". */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

interface SeekBarProps {
  className?: string;
  /** `compact` is the mini-player variant (smaller type, tighter gaps). */
  size?: "compact" | "full";
}

export function SeekBar({ className, size = "full" }: SeekBarProps) {
  const { seek } = usePlayer();
  const { progress, duration } = usePlayerProgress();

  const trackRef = useRef<HTMLDivElement>(null);
  const [scrubTime, setScrubTime] = useState<number | null>(null);

  const hasDuration = Number.isFinite(duration) && duration > 0;
  const safeProgress = Number.isFinite(progress) ? progress : 0;
  const displayTime = scrubTime ?? safeProgress;
  const clampedTime = hasDuration ? Math.min(Math.max(displayTime, 0), duration) : 0;
  const percent = hasDuration ? (clampedTime / duration) * 100 : 0;

  const timeFromClientX = useCallback(
    (clientX: number) => {
      const element = trackRef.current;
      if (!element || !hasDuration) return 0;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      const ratio = (clientX - rect.left) / rect.width;
      return Math.min(Math.max(ratio, 0), 1) * duration;
    },
    [duration, hasDuration],
  );

  // Pointer events cover mouse, pen and touch with one code path; capturing
  // the pointer keeps the drag alive outside the track's own bounds.
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!hasDuration) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrubTime(timeFromClientX(event.clientX));
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (scrubTime === null || !hasDuration) return;
    event.stopPropagation();
    setScrubTime(timeFromClientX(event.clientX));
  };

  const endScrub = (event: React.PointerEvent<HTMLDivElement>) => {
    if (scrubTime === null) return;
    event.stopPropagation();
    const target = timeFromClientX(event.clientX);
    setScrubTime(null);
    seek(target);
  };

  // Keyboard seeking: ←/→ 5s, ↑/↓ 10s, Home/End jump to the edges.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!hasDuration) return;

    const step = event.key === "ArrowUp" || event.key === "ArrowDown" ? 10 : 5;
    let next: number | null = null;

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      next = safeProgress - step;
    } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      next = safeProgress + step;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = duration;
    }

    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    seek(Math.min(Math.max(next, 0), duration));
  };

  // Safety net: if a pointer is lost (e.g. the element unmounts mid-drag),
  // never leave the bar stuck in scrubbing state.
  useEffect(() => {
    if (scrubTime === null) return;
    const cancel = () => setScrubTime(null);
    window.addEventListener("pointercancel", cancel);
    return () => window.removeEventListener("pointercancel", cancel);
  }, [scrubTime]);

  const isCompact = size === "compact";

  return (
    <div
      className={cn(
        "group/seek flex w-full items-center",
        isCompact ? "gap-2" : "gap-3",
        className,
      )}
      // The bar lives inside clickable containers (the mini-player opens the
      // full player on click) — seeking must never trigger those.
      onClick={(event) => event.stopPropagation()}
    >
      <span
        className={cn(
          "shrink-0 tabular-nums text-muted-foreground",
          isCompact ? "text-[10px]" : "text-xs",
        )}
      >
        {formatClock(hasDuration ? clampedTime : 0)}
      </span>

      <div
        ref={trackRef}
        role="slider"
        aria-label="Seek playback position"
        aria-valuemin={0}
        aria-valuemax={hasDuration ? Math.floor(duration) : 0}
        aria-valuenow={hasDuration ? Math.floor(clampedTime) : 0}
        aria-valuetext={`${formatClock(clampedTime)} of ${formatClock(hasDuration ? duration : 0)}`}
        aria-disabled={!hasDuration}
        tabIndex={hasDuration ? 0 : -1}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endScrub}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative flex-1 touch-none select-none outline-none",
          // Generous invisible hit area (>=24px tall) without a bigger thumb.
          "flex h-6 cursor-pointer items-center",
          !hasDuration && "cursor-default opacity-60",
        )}
      >
        <div
          className={cn(
            "w-full overflow-hidden rounded-full bg-[#182227]",
            isCompact ? "h-[2px]" : "h-1",
          )}
        >
          <div
            className="h-full rounded-full bg-[#4FD1C5] transition-[width] duration-100 ease-linear"
            style={{ width: `${percent}%` }}
          />
        </div>
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm transition-opacity duration-200",
            isCompact ? "size-2" : "size-3",
            hasDuration && "group-hover/seek:opacity-100 group-focus-within/seek:opacity-100",
            hasDuration && scrubTime !== null && "opacity-100",
          )}
          style={{ left: `${percent}%` }}
        />
      </div>

      <span
        className={cn(
          "shrink-0 tabular-nums text-muted-foreground",
          isCompact ? "text-[10px]" : "text-xs",
        )}
      >
        {formatClock(hasDuration ? duration : 0)}
      </span>
    </div>
  );
}
