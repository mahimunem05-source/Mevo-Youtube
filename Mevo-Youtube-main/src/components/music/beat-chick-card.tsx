import { memo, useEffect, useRef, useState } from "react";
import { Sparkles, Activity, Mic2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Song } from "@/data/songs";
import { MultiBandVisualizer } from "@/components/music/multi-band-visualizer";
import { AudioReactiveChick } from "@/components/music/audio-reactive-chick";
import { SyncedLyricsVisualizer } from "@/components/music/synced-lyrics-visualizer";
import { fetchSongLyrics } from "@/services/lyricsService";
import { cn } from "@/lib/utils";

export interface BeatChickCardProps {
  song?: Song | null;
  isPlaying: boolean;
  className?: string;
}

export const BeatChickCard = memo(function BeatChickCard({
  song,
  isPlaying,
  className,
}: BeatChickCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  // Monitor viewport visibility with 100px buffer to pause heavy visualizer loops when scrolled offscreen
  useEffect(() => {
    const el = cardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: "100px 0px" },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Dual-source lyrics query (LRCLIB -> YouTube Closed Captions fallback)
  const lyricsQuery = useQuery({
    queryKey: ["song-lyrics", song?.id, song?.title, song?.artist, song?.audio, Math.round(song?.duration || 0)],
    queryFn: () => (song ? fetchSongLyrics(song) : null),
    enabled: Boolean(song && song.id),
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });

  const lyrics = lyricsQuery.data;
  const hasLyrics = Boolean(lyrics && lyrics.lines && lyrics.lines.length > 0);

  return (
    <div
      ref={cardRef}
      id="beat-chick-card"
      data-tour="lyrics"
      style={{
        transform: "translateZ(0)",
        WebkitTransform: "translateZ(0)",
        contain: "paint layout",
      }}
      className={cn(
        "group relative overflow-hidden rounded-[16px] border border-[#243339] bg-[#0E1518]/90 p-3 shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-200 select-none will-change-transform",
        className,
      )}
    >
      {/* Ambient background glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-px -z-10 rounded-[16px] bg-gradient-to-br from-teal-500/10 via-transparent to-teal-500/5 opacity-60"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-teal-950/20 to-transparent"
      />

      {/* ── CARD HEADER ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-950/60 border border-teal-500/30 overflow-hidden shadow-inner">
            {hasLyrics ? (
              <Mic2 className="size-3.5 text-teal-300 animate-pulse" />
            ) : (
              <img
                src="/beat-chick.png"
                alt="Beat Chick"
                width={28}
                height={28}
                className="size-6 object-contain pointer-events-none select-none"
              />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
                {hasLyrics ? "LIVE LYRICS" : "BEAT CHICK"}
              </span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-teal-400/15 px-1.5 py-0.2 text-[8px] font-bold text-teal-300 border border-teal-400/20">
                {hasLyrics ? (
                  <span>{lyrics?.source === "aligned" ? "ALIGNED" : lyrics?.source === "youtube_captions" ? "CC" : "LYRICS"}</span>
                ) : (
                  <>
                    <Sparkles className="size-2 text-teal-300" />
                    <span>VIP</span>
                  </>
                )}
              </span>
            </div>
            <p className="truncate text-[9px] font-medium text-teal-400/80">
              {hasLyrics ? (lyrics?.source === "aligned" ? "Audio-aligned lyrics" : "Lyrics for this track") : "Feel the beat, feel the vibe!"}
            </p>
          </div>
        </div>

        {/* Live Multi-Band EQ badge */}
        <div className="flex items-center gap-1.5 rounded-full bg-teal-400/10 border border-teal-400/20 px-2.5 py-0.5 text-[9px] font-bold text-teal-300">
          <Activity className={cn("size-2.5 text-teal-300", isPlaying && "animate-pulse")} />
          <span className="tracking-wider uppercase font-extrabold">
            {isPlaying ? "AUDIO EQ" : "STANDBY"}
          </span>
        </div>
      </div>

      {/* ── CARD MAIN VISUAL BODY (Multi-Band Visualizer + Center [Lyrics vs. Chick]) ─ */}
      <div className={cn("relative mt-2 flex h-32 sm:h-36 items-center justify-between px-2 transition-all duration-300", hasLyrics ? "overflow-hidden" : "overflow-visible")}>
        {/* Left Multi-Band Visualizer (Bass / Vocal / Treble) */}
        <MultiBandVisualizer isPlaying={isPlaying} isVisible={isVisible} side="left" className="w-16 sm:w-20 shrink-0" />

        {/* Center: Synced Scrolling Lyrics OR Audio-Reactive Dancing Beat Chick */}
        <div className={cn("relative flex-1 h-full mx-2 flex items-center justify-center", hasLyrics ? "overflow-hidden" : "overflow-visible")}>
          {hasLyrics ? (
            <SyncedLyricsVisualizer lines={lyrics!.lines} className="size-full" />
          ) : (
            <AudioReactiveChick isPlaying={isPlaying} isVisible={isVisible} bpm={song?.bpm || 120} />
          )}
        </div>

        {/* Right Multi-Band Visualizer (Bass / Vocal / Treble) */}
        <MultiBandVisualizer isPlaying={isPlaying} isVisible={isVisible} side="right" className="w-16 sm:w-20 shrink-0" />
      </div>

      {/* ── CARD FOOTER / MULTI-BAND SPECTRUM TEXT ────────────────────────── */}
      <div className="mt-1 flex items-center justify-between text-[10px] text-white/50 px-1 pt-1.5 border-t border-white/[0.04] pointer-events-none">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "size-1.5 rounded-full transition-colors",
              isPlaying ? "bg-teal-400 animate-pulse shadow-[0_0_6px_#4FD1C5]" : "bg-white/30",
            )}
          />
          <span className="font-semibold text-white/70">
            {hasLyrics ? "LYRIC STREAM" : isPlaying ? "3-Band Web Audio Engine Active" : "Waiting for next beat"}
          </span>
        </span>
        <span className="text-teal-400/80 font-medium text-[9px] tracking-wide">
          {hasLyrics ? "MEVO • AUDIO" : "Bass • Vocals • Treble"}
        </span>
      </div>
    </div>
  );
});

export default BeatChickCard;
