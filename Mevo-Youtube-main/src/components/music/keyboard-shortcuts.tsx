import { useEffect } from "react";
import { usePlayer, usePlayerProgress } from "@/lib/player-context";

/** Global playback shortcuts: Space, arrows, M, L. */
export function KeyboardShortcuts() {
  const { toggle, next, previous, seek, toggleMute, current, toggleLike } = usePlayer();
  const { progress } = usePlayerProgress();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          toggle();
          break;
        case "ArrowRight":
          if (e.shiftKey) next();
          else seek(progress + 5);
          break;
        case "ArrowLeft":
          if (e.shiftKey) previous();
          else seek(Math.max(progress - 5, 0));
          break;
        case "KeyM":
          toggleMute();
          break;
        case "KeyL":
          if (current) toggleLike(current);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, next, previous, seek, progress, toggleMute, current, toggleLike]);

  return null;
}
