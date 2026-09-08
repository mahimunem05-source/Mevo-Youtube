import { memo, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface BeatChickVideoProps {
  isPlaying: boolean;
  className?: string;
}

export const BeatChickVideo = memo(function BeatChickVideo({
  isPlaying,
  className,
}: BeatChickVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Synchronize play/pause with music player state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Strictly visual — guarantees zero audio playback
    video.muted = true;
    video.volume = 0;
    video.defaultMuted = true;

    if (isPlaying) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay fallback: ensure muted and retry safely
          video.muted = true;
          video.play().catch(() => {});
        });
      }
    } else {
      video.pause();
    }
  }, [isPlaying]);

  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden", className)}>
      <video
        ref={videoRef}
        src="/beat-chick-dance.mp4"
        autoPlay={isPlaying}
        loop
        muted
        playsInline
        controls={false}
        preload="auto"
        disablePictureInPicture
        disableRemotePlayback
        aria-label="Beat Chick Dancing Mascot"
        className="size-full object-contain pointer-events-none select-none bg-transparent"
        style={{
          background: "transparent",
          outline: "none",
        }}
      />
    </div>
  );
});
