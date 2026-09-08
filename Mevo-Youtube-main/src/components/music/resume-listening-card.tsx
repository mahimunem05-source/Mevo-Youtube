import { memo } from "react";
import { Play, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import type { Song } from "@/data/songs";
import { formatTime } from "@/data/songs";
import { usePlayer } from "@/lib/player-context";
import { SongCoverImage } from "@/components/music/song-cover-image";

export interface ResumeListeningCardProps {
  song: Song;
  progress: number;
  onDismiss?: () => void;
}

export const ResumeListeningCard = memo(function ResumeListeningCard({
  song,
  progress,
}: ResumeListeningCardProps) {
  const { play, seek, current, isPlaying } = usePlayer();

  const isThisSong = current?.id === song.id;
  const percent = song.duration > 0 ? Math.min(100, Math.round((progress / song.duration) * 100)) : 0;

  const handleResume = () => {
    play(song);
    if (progress > 0) {
      setTimeout(() => {
        seek(progress);
      }, 150);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121c1f]/80 p-2.5 sm:p-3 md:px-4 shadow-xl backdrop-blur-xl transition-all duration-300 hover:border-emerald-500/30 hover:bg-[#121c1f]/95"
    >
      {/* Ambient background glow from artwork */}
      {song.cover && (
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-cover bg-center opacity-15 blur-xl scale-125 transition-opacity duration-300 group-hover:opacity-25"
          style={{ backgroundImage: `url(${song.cover})` }}
        />
      )}

      <div className="flex items-center justify-between gap-3 sm:gap-4">
        {/* Left: Thumbnail & Metadata */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="relative size-11 sm:size-12 shrink-0 overflow-hidden rounded-xl border border-white/10 shadow-md">
            <SongCoverImage
              src={song.cover}
              alt={song.title}
              width={80}
              height={80}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full shrink-0">
                <RotateCcw className="size-2.5 animate-spin-reverse" />
                Resume
              </span>
              <h3 className="truncate text-xs sm:text-sm font-semibold text-foreground">
                {song.title}
              </h3>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 text-[11px] sm:text-xs text-muted-foreground truncate">
              <span className="truncate">{song.artist}</span>
              <span className="shrink-0 text-white/30">•</span>
              <span className="shrink-0 font-mono text-[10px] sm:text-[11px] text-emerald-400/90">
                {formatTime(progress)} / {song.duration > 0 ? formatTime(song.duration) : "--:--"}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Progress Indicator & Action Button */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          {/* Progress Bar (Visible on tablet & desktop) */}
          <div className="hidden sm:flex flex-col gap-1 w-24 md:w-32">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-[9px] md:text-[10px] text-right font-mono text-muted-foreground">
              {percent}% listened
            </span>
          </div>

          {/* Compact Resume Button */}
          <button
            type="button"
            onClick={handleResume}
            className="flex items-center justify-center gap-1.5 rounded-full bg-emerald-400 hover:bg-emerald-300 text-black px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs font-bold shadow-md transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer shrink-0"
            aria-label={`Resume listening to ${song.title}`}
          >
            <Play className="size-3.5 fill-current translate-x-0.5" />
            <span className="hidden xs:inline sm:inline">
              {isThisSong && isPlaying ? "Playing" : "Resume"}
            </span>
          </button>
        </div>
      </div>
    </motion.div>
  );
});
