import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  ChevronLeft,
  EllipsisVertical,
  Heart,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  X,
  Volume2,
  Volume1,
  VolumeX,
  Share2,
  ListMusic,
  Sparkles,
  Radio,
  Disc3,
  User,
  Download,
  Settings,
  FolderPlus,
} from "lucide-react";
import { formatTime, getSong, DEFAULT_COVER, isYouTubeSong, type Song } from "@/data/songs";
import { getPublishedSongById, isUuid } from "@/services/songService";
import { databaseSongToPlayerSong } from "@/lib/song-adapter";
import { getVideoInfo, getYouTubeStreamUrl } from "@/lib/extractor";
import { SongCoverImage } from "@/components/music/song-cover-image";
import { usePlayer } from "@/lib/player-context";
import { usePlaylists } from "@/context/PlaylistContext";
import { useNavigationHistory } from "@/lib/navigation-history";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { shareContent } from "@/lib/share";
import { DownloadButton } from "@/components/music/download-button";
import { QueueList } from "@/components/music/queue-list";
import { SeekBar } from "@/components/music/seek-bar";
import { SongPlayerBackground } from "@/components/music/song-player-background";
import { BeatChickCard } from "@/components/music/beat-chick-card";

export const Route = createFileRoute("/song/$songId")({
  loader: async ({ params }) => {
    const songId = params.songId?.trim() || "";
    const staticSong = getSong(songId);

    if (staticSong) {
      return { song: staticSong };
    }

    // 1. Handle YouTube track IDs (e.g., "yt-cvo_L7xrf1Q" or 11-char ID)
    const isYt = songId.startsWith("yt-") || /^[a-zA-Z0-9_-]{11}$/.test(songId);
    if (isYt) {
      try {
        const cleanVid = songId.startsWith("yt-") ? songId.slice(3) : songId;
        const info = await getVideoInfo(cleanVid);
        if (info && info.id) {
          const streamUrl = getYouTubeStreamUrl(info.id);
          const ytSong: Song = {
            id: `yt-${info.id}`,
            title: info.title || "Unknown Title",
            artist: info.artist || info.uploader || info.channelTitle || "YouTube Artist",
            album: "YouTube Stream",
            genre: "Music",
            year: new Date().getFullYear(),
            duration: info.duration || 0,
            cover: info.thumbnail || `https://img.youtube.com/vi/${info.id}/hqdefault.jpg`,
            audio: streamUrl,
            section: "bangla",
            category: "YouTube",
            trending: false,
          };
          return { song: ytSong };
        }
      } catch (error) {
        console.warn("YouTube song loader lookup failed:", error);
      }
    }

    // 2. Only query Supabase if it is a valid UUID
    if (isUuid(songId)) {
      try {
        const databaseSong = await getPublishedSongById(songId);
        if (databaseSong) {
          return {
            song: databaseSongToPlayerSong(databaseSong),
          };
        }
      } catch (error) {
        console.warn("Song loader database lookup failed:", error);
      }
    }

    return { song: null };
  },
  head: ({ loaderData }) => {
    if (!loaderData || !loaderData.song) {
      return {
        meta: [{ title: "Track unavailable — MEVO" }, { name: "robots", content: "noindex" }],
      };
    }

    const { song } = loaderData;
    const title = `${song.title} — ${song.artist} | MEVO`;
    const description = `Listen to ${song.title} by ${song.artist} from ${song.album}. ${song.genre}, ${song.year}.`;

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  component: SongPage,
});

function VolumeControl({
  volume,
  muted,
  setVolume,
  toggleMute,
}: {
  volume: number;
  muted: boolean;
  setVolume: (v: number) => void;
  toggleMute: () => void;
}) {
  const currentVol = muted ? 0 : volume;
  const percentage = Math.round(currentVol * 100);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
  };

  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
        className="grid size-8 place-items-center rounded-full text-white/70 hover:text-white transition-colors cursor-pointer"
      >
        {muted || volume === 0 ? (
          <VolumeX className="size-4 text-red-400" />
        ) : volume < 0.5 ? (
          <Volume1 className="size-4 text-teal-400/90" />
        ) : (
          <Volume2 className="size-4 text-teal-400" />
        )}
      </button>

      <div className="relative flex items-center w-24 xl:w-28 group">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={currentVol}
          onChange={handleSliderChange}
          aria-label="Volume slider"
          className="w-full h-1.5 bg-[#182227] rounded-full appearance-none cursor-pointer accent-[#4FD1C5]"
          style={{
            background: `linear-gradient(to right, #4FD1C5 0%, #4FD1C5 ${percentage}%, #182227 ${percentage}%, #182227 100%)`,
          }}
        />
      </div>
      <span className="w-8 text-[11px] tabular-nums text-white/50 text-right font-medium">
        {percentage}%
      </span>
    </div>
  );
}

function SongPage() {
  const loaderData = Route.useLoaderData();
  const { songId } = Route.useParams();
  const player = usePlayer();
  const { openAddToPlaylistModal } = usePlaylists();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { dismissPlayer } = useNavigationHistory();

  // Multi-tier song resolution: Memory -> Queue -> Catalogue -> Loader -> Static
  const song: Song | null =
    (player.current?.id === songId ? player.current : null) ??
    loaderData?.song ??
    player.queue.find((item) => item.id === songId) ??
    player.catalogue.find((item) => item.id === songId) ??
    getSong(songId) ??
    null;

  const isCurrent = Boolean(song && player.current?.id === song.id);
  const playing = isCurrent && player.isPlaying;
  const liked = song ? player.isLiked(song.id) : false;
  const [activeDesktopTab, setActiveDesktopTab] = useState<"beatchick" | "queue">("beatchick");
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMobileMenu) return;
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setShowMobileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [showMobileMenu]);

  const lastSyncedIdRef = useRef(player.current?.id ?? null);
  useEffect(() => {
    const currentId = player.current?.id ?? null;
    if (!currentId || lastSyncedIdRef.current === currentId) return;
    lastSyncedIdRef.current = currentId;

    if (song && currentId !== song.id) {
      void navigate({
        to: "/song/$songId",
        params: { songId: currentId },
        replace: true,
      });
    }
  }, [player.current?.id, song, navigate]);

  useEffect(() => {
    if (song) {
      player.ensureQueueContainsSong(song);
    }
  }, [song, player.ensureQueueContainsSong]);

  if (!song) {
    return (
      <div className="relative flex min-h-screen items-center justify-center px-4 text-center text-white selection:bg-[#4FD1C5] selection:text-[#071012]">
        <SongPlayerBackground />
        <div className="relative z-10 max-w-md">
          <h2 className="text-xl font-bold text-white">Track Unavailable</h2>
          <p className="mt-2 text-sm text-white/60">This song could not be loaded.</p>
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => dismissPlayer()}
              className="rounded-full bg-[#4FD1C5] px-6 py-2 text-xs font-bold text-[#071012] cursor-pointer hover:bg-[#4FD1C5]/90 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handlePlay = () => {
    if (isCurrent) {
      player.toggle();
      return;
    }

    const queueIndex = player.queue.findIndex((item) => item.id === song.id);

    if (queueIndex >= 0) {
      player.playQueueIndex(queueIndex);
    } else {
      player.play(song);
    }
  };

  const handleShare = async () => {
    await shareContent({
      title: `${song.title} — ${song.artist}`,
      text: `Listening to ${song.title} by ${song.artist} on MEVO`,
      url: window.location.href,
    });
  };

  const playingFromTitle =
    player.queueSource?.title ||
    song.category ||
    (song.album && song.album !== "Singles" ? song.album : "MEVO");

  return (
    <div className="relative min-h-screen text-white selection:bg-[#4FD1C5] selection:text-[#071012]">
      {/* Premium Cinematic Ambient Lighting for Main Song Player */}
      <SongPlayerBackground />

      {/* =========================================================================
          MOBILE VIEW (< 1024px) — 100% UNTOUCHED AND EXACTLY AS ORIGINALLY DESIGNED
          ========================================================================= */}
      <div className="mx-auto max-w-md px-5 pt-2 pb-6 sm:max-w-lg sm:px-6 lg:hidden">
        {/* 1. TOP MINIMAL HEADER ("Playing From" header close to top) */}
        <header className="flex items-center justify-between py-1">
          <button
            type="button"
            onClick={() => dismissPlayer()}
            className="grid size-8 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Back"
          >
            <ChevronDown className="size-5" />
          </button>

          <div className="text-center min-w-0 px-2">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.2em] text-teal-400">
              {t("player.playingFrom", "PLAYING FROM")}
            </p>
            <p className="truncate text-xs font-bold text-white mt-0.5">{playingFromTitle}</p>
          </div>

          <div className="relative" ref={mobileMenuRef}>
            <button
              type="button"
              onClick={() => setShowMobileMenu((prev) => !prev)}
              aria-label="More options"
              aria-expanded={showMobileMenu}
              className="grid size-8 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
            >
              <EllipsisVertical className="size-4" />
            </button>

            <AnimatePresence>
              {showMobileMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -6 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  style={{
                    willChange: "transform, opacity",
                    transform: "translate3d(0,0,0)",
                    backfaceVisibility: "hidden",
                  }}
                  className="absolute right-0 top-full mt-2 w-48 origin-top-right z-50 rounded-2xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur-md"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileMenu(false);
                      openAddToPlaylistModal(song);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                  >
                    <FolderPlus className="size-4 text-teal-400" />
                    <span>Add to Playlist</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileMenu(false);
                      void navigate({ to: "/all-songs" });
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                  >
                    <ListMusic className="size-4 text-teal-400" />
                    <span>{t("nav.allSongs", "All Songs")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileMenu(false);
                      void navigate({ to: "/albums" });
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                  >
                    <Disc3 className="size-4 text-teal-400" />
                    <span>{t("nav.albums", "Albums")}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileMenu(false);
                      void navigate({ to: "/artists" });
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                  >
                    <User className="size-4 text-teal-400" />
                    <span>Artists</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileMenu(false);
                      void navigate({ to: "/downloads" });
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                  >
                    <Download className="size-4 text-teal-400" />
                    <span>Downloads</span>
                  </button>

                  <div className="my-1 border-t border-white/10" />

                  <button
                    type="button"
                    onClick={() => {
                      setShowMobileMenu(false);
                      void navigate({ to: "/settings" });
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                  >
                    <Settings className="size-4 text-teal-400" />
                    <span>Settings</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        {/* 2. ALBUM ARTWORK — Dynamic Aspect Ratio (16:9 for YouTube, 1:1 for Standard) */}
        <div className="relative mt-2 mb-2 flex justify-center">
          {/* Subtle Ambient Teal Glow behind Artwork */}
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 m-auto rounded-full bg-[#4FD1C5]/15 blur-3xl",
              isYouTubeSong(song) ? "w-64 h-36" : "size-44",
            )}
          />

          <motion.img
            src={song.cover || DEFAULT_COVER}
            alt={`${song.title} artwork`}
            width={800}
            height={isYouTubeSong(song) ? 450 : 800}
            decoding="auto"
            onError={(e) => {
              const target = e.currentTarget;
              if (target.src !== DEFAULT_COVER) {
                target.src = DEFAULT_COVER;
              }
            }}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className={cn(
              "relative z-10 rounded-[22px] object-cover shadow-[0_14px_32px_rgba(0,0,0,0.60)] border border-white/10 ring-1 ring-white/10",
              isYouTubeSong(song)
                ? "aspect-video w-[90%] max-w-[340px]"
                : "aspect-square w-[72%] max-w-[280px]",
            )}
          />
        </div>

        {/* 3. SONG INFORMATION */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, delay: 0.08, ease: [0.25, 1, 0.5, 1] }}
          className="mt-2.5 flex items-center justify-between gap-3"
        >
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[17px] font-extrabold tracking-tight text-white sm:text-xl">
              {song.title}
            </h1>
            <p className="truncate text-[11px] font-semibold text-teal-400 mt-0.5">{song.artist}</p>
          </div>

          {/* Heart + Share actions, side by side */}
          <div className="flex shrink-0 items-center gap-1">
            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              onClick={handleShare}
              aria-label="Share track"
              className="p-1 text-teal-400 transition-colors hover:text-teal-300 cursor-pointer"
            >
              <Share2 className="size-5 text-teal-400/80 hover:text-teal-400 transition-colors" />
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              onClick={() => player.toggleLike(song)}
              aria-label={liked ? "Remove from favourites" : "Add to favourites"}
              className="p-1 text-teal-400 transition-colors hover:text-teal-300 cursor-pointer"
            >
              <Heart
                className={cn(
                  "size-5 transition-colors",
                  liked ? "fill-teal-400 text-teal-400" : "text-teal-400/80 hover:text-teal-400",
                )}
              />
            </motion.button>
          </div>
        </motion.div>

        {/* 4. PROGRESS BAR */}
        <div className="mt-2 w-full">
          {isCurrent ? (
            <SeekBar />
          ) : (
            <div className="flex w-full items-center gap-3 opacity-70">
              <span className="shrink-0 text-[11px] tabular-nums text-teal-400/80">0:00</span>
              <div className="h-1 flex-1 rounded-full bg-[#182227] overflow-hidden">
                <div className="h-full w-0 bg-[#4FD1C5]" />
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-teal-400/80">
                {formatTime(song.duration)}
              </span>
            </div>
          )}
        </div>

        {/* 5. PLAYBACK CONTROLS */}
        <div className="mt-2.5 flex items-center justify-between px-1">
          {/* Shuffle */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={player.toggleShuffle}
            aria-label="Shuffle"
            className={cn(
              "grid size-8 place-items-center transition-colors",
              player.shuffle ? "text-teal-400" : "text-white/60 hover:text-white",
            )}
          >
            <Shuffle className="size-4" />
          </motion.button>

          {/* Previous */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={player.previous}
            aria-label="Previous"
            className="grid size-9 place-items-center text-white/90 transition-colors hover:text-white"
          >
            <SkipBack className="size-5 fill-current" />
          </motion.button>

          {/* Main Play/Pause — Circular teal button */}
          <motion.button
            type="button"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.94 }}
            onClick={handlePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="grid size-[52px] place-items-center rounded-full bg-[#4FD1C5] text-[#071012] shadow-[0_0_16px_rgba(79,209,197,0.30)] transition-all hover:bg-[#4FD1C5]/90 hover:shadow-[0_0_22px_rgba(79,209,197,0.45)]"
          >
            {playing ? (
              <Pause className="size-5 fill-current text-[#071012]" />
            ) : (
              <Play className="size-5 translate-x-0.5 fill-current text-[#071012]" />
            )}
          </motion.button>

          {/* Next */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={player.next}
            aria-label="Next"
            className="grid size-9 place-items-center text-white/90 transition-colors hover:text-white"
          >
            <SkipForward className="size-5 fill-current" />
          </motion.button>

          {/* Repeat */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            onClick={player.toggleRepeat}
            aria-label={`Repeat mode: ${player.repeat === "one" ? "Repeat One" : "Continuous Queue"}`}
            title={`Repeat: ${player.repeat === "one" ? "Repeat One" : "Continuous Queue"}`}
            className="grid size-8 place-items-center transition-all cursor-pointer text-teal-400 drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]"
          >
            {player.repeat === "one" ? (
              <Repeat1 className="size-4.5" />
            ) : (
              <Repeat className="size-4.5" />
            )}
          </motion.button>
        </div>

        {/* 6. ACTION BUTTONS — Download pill */}
        <div className="mt-2.5 flex items-center justify-center">
          <DownloadButton
            song={song}
            variant="full"
            className="!h-8 !px-4 text-[11px] font-bold rounded-full border border-white/15 bg-white/5 backdrop-blur-md hover:bg-white/10 text-white/85 shadow-sm"
          />
        </div>

        {/* 7. BEAT CHICK CARD — inline companion widget */}
        <div className="mt-2.5">
          <BeatChickCard song={song} isPlaying={playing} />
        </div>

        {/* 8. UP NEXT SECTION */}
        <section className="mt-3">
          <QueueList song={song} />
        </section>
      </div>

      {/* =========================================================================
          DESKTOP FULLSCREEN PLAYER VIEW (lg: 1024px+ and xl: 1280px+)
          Dedicated 2-column Apple Music / Spotify-inspired layout
          ========================================================================= */}
      <div className="hidden lg:flex lg:flex-col lg:h-screen lg:max-h-screen lg:overflow-hidden max-w-7xl mx-auto px-8 xl:px-12 pt-5 pb-4">
        {/* 1. DESKTOP TOP BAR */}
        <header className="flex items-center justify-between pb-3 shrink-0">
          <button
            type="button"
            onClick={() => dismissPlayer()}
            className="flex items-center gap-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 px-4 py-2 text-xs font-semibold text-white/90 backdrop-blur-md transition-all active:scale-95 cursor-pointer shadow-sm"
            aria-label="Back to browse"
          >
            <ChevronLeft className="size-4 text-teal-400" />
            <span>Back</span>
          </button>

          <div className="text-center min-w-0 px-4">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-teal-400">
              {t("player.playingFrom", "PLAYING FROM")}
            </span>
            <p className="truncate text-sm font-bold text-white/90 max-w-md mt-0.5">
              {playingFromTitle}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={player.toggleAutoplay}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold backdrop-blur-md transition-colors cursor-pointer",
                player.autoplayEnabled
                  ? "border-teal-400/30 bg-teal-400/10 text-teal-300 shadow-[0_0_12px_rgba(79,209,197,0.15)]"
                  : "border-white/10 bg-white/5 text-white/50 hover:text-white",
              )}
              title="Autoplay recommended tracks when queue ends"
            >
              <Radio className="size-3.5" />
              <span>Autoplay: {player.autoplayEnabled ? "On" : "Off"}</span>
            </button>

            <div className="hidden xl:flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/60 backdrop-blur-md">
              <Sparkles className="size-3.5 text-teal-400" />
              <span>Lossless • 320kbps</span>
            </div>
          </div>
        </header>

        {/* 2. DESKTOP 2-COLUMN MAIN SPLIT */}
        <div className="flex-1 grid grid-cols-12 gap-8 xl:gap-12 min-h-0 py-3 items-center">
          {/* Left Column: Artwork + Song Metadata + Actions */}
          <div className="col-span-5 xl:col-span-5 flex flex-col items-center justify-center max-w-md mx-auto w-full">
            {/* Artwork with ambient glow */}
            <div className="relative group w-full flex justify-center">
              <div
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute inset-0 -inset-x-6 m-auto rounded-full bg-[#4FD1C5]/20 blur-3xl transition-opacity duration-700 group-hover:opacity-100 opacity-70",
                  isYouTubeSong(song) ? "w-80 h-44 xl:w-96 xl:h-52" : "size-72 xl:size-80",
                )}
              />
              <motion.img
                src={song.cover}
                alt={`${song.title} artwork`}
                width={800}
                height={isYouTubeSong(song) ? 450 : 800}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: playing ? 1.02 : 1, opacity: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className={cn(
                  "relative z-10 rounded-3xl object-cover shadow-[0_20px_50px_rgba(0,0,0,0.80)] border border-white/10 ring-1 ring-white/10",
                  isYouTubeSong(song)
                    ? "aspect-video w-full max-w-[380px] xl:max-w-[420px]"
                    : "aspect-square w-72 sm:w-80 xl:w-96",
                )}
              />
            </div>

            {/* Song details */}
            <div className="mt-5 text-center w-full px-2">
              <h1 className="font-display text-2xl xl:text-3xl font-extrabold tracking-tight text-white truncate">
                {song.title}
              </h1>
              <p className="mt-1 text-base font-semibold text-teal-400 truncate">{song.artist}</p>
              <div className="mt-2 flex items-center justify-center gap-2 text-xs text-white/50">
                {song.album && <span className="truncate max-w-[200px]">{song.album}</span>}
                {song.year && <span>• {song.year}</span>}
                {song.genre && <span>• {song.genre}</span>}
              </div>
            </div>

            {/* Actions Row (Like, Download, Share) */}
            <div className="mt-4 flex items-center justify-center gap-3">
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.05 }}
                onClick={() => player.toggleLike(song)}
                aria-label={liked ? "Remove from favourites" : "Add to favourites"}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold backdrop-blur-md transition-all shadow-md cursor-pointer",
                  liked
                    ? "border-teal-400/40 bg-teal-400/15 text-teal-300 shadow-[0_0_15px_rgba(79,209,197,0.2)]"
                    : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white",
                )}
              >
                <Heart
                  className={cn("size-4", liked ? "fill-teal-400 text-teal-400" : "text-white/80")}
                />
                <span>{liked ? "Liked" : "Like"}</span>
              </motion.button>

              <DownloadButton
                song={song}
                variant="full"
                className="!h-9 !px-4 text-xs font-semibold"
              />

              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.05 }}
                onClick={() => openAddToPlaylistModal(song)}
                aria-label="Add to playlist"
                className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 backdrop-blur-md transition-all hover:bg-white/10 hover:text-white shadow-md cursor-pointer"
              >
                <FolderPlus className="size-4 text-teal-400" />
                <span>Playlist</span>
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.05 }}
                onClick={handleShare}
                aria-label="Share song"
                className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/80 backdrop-blur-md transition-all hover:bg-white/10 hover:text-white shadow-md cursor-pointer"
              >
                <Share2 className="size-4" />
                <span>Share</span>
              </motion.button>
            </div>
          </div>

          {/* Right Column: Tabbed Beat Chick Companion & Queue Deck */}
          <div className="col-span-7 xl:col-span-7 flex flex-col h-full max-h-[500px] xl:max-h-[540px] rounded-3xl bg-[#12191D]/80 border border-[#26343A] backdrop-blur-2xl p-6 shadow-2xl overflow-hidden">
            {/* Tab Switcher Header */}
            <div className="flex w-full items-center justify-between border-b border-white/10 pb-4 shrink-0">
              <div className="flex items-center gap-1.5 rounded-2xl bg-black/40 p-1 border border-white/10">
                <button
                  type="button"
                  onClick={() => setActiveDesktopTab("beatchick")}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-bold transition-all cursor-pointer",
                    activeDesktopTab === "beatchick"
                      ? "bg-[#4FD1C5] text-[#071012] shadow-[0_0_15px_rgba(79,209,197,0.35)]"
                      : "text-white/60 hover:text-white",
                  )}
                >
                  <img
                    src="/beat-chick.png"
                    alt=""
                    width={16}
                    height={16}
                    className="size-4 object-contain"
                  />
                  <span>Beat Chick</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDesktopTab("queue")}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-bold transition-all cursor-pointer",
                    activeDesktopTab === "queue"
                      ? "bg-[#4FD1C5] text-[#071012] shadow-[0_0_15px_rgba(79,209,197,0.35)]"
                      : "text-white/60 hover:text-white",
                  )}
                >
                  <ListMusic className="size-3.5" />
                  <span>
                    {t("player.upNext", "Up Next")} ({player.queue.length})
                  </span>
                </button>
              </div>

              {/* Top-Right: Official Glowing MEVO Brand Mark */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/10 backdrop-blur-md shadow-sm select-none">
                <span className="text-[#00FFCC] text-sm leading-none drop-shadow-[0_0_8px_rgba(0,255,204,0.45)]">
                  ♫
                </span>
                <span className="font-display text-xs font-black tracking-[0.2em] text-[#00FFCC] drop-shadow-[0_0_8px_rgba(0,255,204,0.45)] uppercase">
                  MEVO
                </span>
              </div>
            </div>

            {/* Tab Contents */}
            {activeDesktopTab === "beatchick" ? (
              <div className="relative flex-1 overflow-y-auto py-3 no-scrollbar space-y-4">
                <BeatChickCard song={song} isPlaying={playing} className="bg-[#0E1518]/70" />

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center">
                    <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">
                      BEAT STATUS
                    </p>
                    <p className="mt-1 text-sm font-extrabold text-white">
                      {playing ? "In Sync • 60 FPS" : "Standby"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-center">
                    <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">
                      WIDGET MODE
                    </p>
                    <p className="mt-1 text-xs font-extrabold text-teal-300">
                      Inline Audio Companion
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto py-4 pr-1">
                <QueueList song={song} />
              </div>
            )}
          </div>
        </div>

        {/* 3. DESKTOP BOTTOM PLAYBACK DOCK */}
        <footer className="mt-auto shrink-0 pt-3 border-t border-white/10">
          {/* Seek Bar */}
          <div className="w-full mb-3">
            {isCurrent ? (
              <SeekBar />
            ) : (
              <div className="flex w-full items-center gap-3 opacity-70">
                <span className="shrink-0 text-[11px] tabular-nums text-teal-400/80">0:00</span>
                <div className="h-1 flex-1 rounded-full bg-[#182227] overflow-hidden">
                  <div className="h-full w-0 bg-[#4FD1C5]" />
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-teal-400/80">
                  {formatTime(song.duration)}
                </span>
              </div>
            )}
          </div>

          {/* Controls Bar (3 columns: Left now playing, Center controls, Right volume) */}
          <div className="flex items-center justify-between">
            {/* Left: Mini track identity */}
            <div className="flex items-center gap-3 w-1/4 min-w-0">
              <SongCoverImage
                src={song.cover}
                alt=""
                width={44}
                height={44}
                loading="eager"
                decoding="auto"
                className="size-11 rounded-lg object-cover ring-1 ring-white/10 shadow"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-white">{song.title}</p>
                <p className="truncate text-[11px] text-teal-400/80">{song.artist}</p>
              </div>
            </div>

            {/* Center: Playback Controls */}
            <div className="flex items-center justify-center gap-3 sm:gap-4">
              {/* Shuffle */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={player.toggleShuffle}
                aria-label="Shuffle"
                className={cn(
                  "grid size-9 place-items-center rounded-full transition-colors cursor-pointer",
                  player.shuffle
                    ? "text-teal-400 bg-teal-400/10"
                    : "text-white/60 hover:text-white hover:bg-white/5",
                )}
                title={player.shuffle ? "Shuffle On" : "Shuffle Off"}
              >
                <Shuffle className="size-4" />
              </motion.button>

              {/* Previous */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={player.previous}
                aria-label="Previous"
                className="grid size-10 place-items-center rounded-full text-white/90 transition-colors hover:text-white hover:bg-white/5 cursor-pointer"
              >
                <SkipBack className="size-5 fill-current" />
              </motion.button>

              {/* Main Play/Pause Button */}
              <div className="relative">
                {playing && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-full animate-ping"
                    style={{
                      background: "transparent",
                      boxShadow: "0 0 0 0 rgba(79,209,197,0.45)",
                      animation: "player-ring-pulse 2.4s ease-out infinite",
                    }}
                  />
                )}
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.06 }}
                  whileTap={{ scale: 0.92 }}
                  onClick={handlePlay}
                  aria-label={playing ? "Pause" : "Play"}
                  className="relative grid size-12 place-items-center rounded-full bg-[#4FD1C5] text-[#071012] shadow-[0_0_20px_rgba(79,209,197,0.35)] transition-all hover:bg-[#4FD1C5]/90 hover:shadow-[0_0_26px_rgba(79,209,197,0.5)] cursor-pointer"
                >
                  {playing ? (
                    <Pause className="size-5 fill-current text-[#071012]" />
                  ) : (
                    <Play className="size-5 translate-x-0.5 fill-current text-[#071012]" />
                  )}
                </motion.button>
              </div>

              {/* Next */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={player.next}
                aria-label="Next"
                className="grid size-10 place-items-center rounded-full text-white/90 transition-colors hover:text-white hover:bg-white/5 cursor-pointer"
              >
                <SkipForward className="size-5 fill-current" />
              </motion.button>

              {/* Repeat */}
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={player.toggleRepeat}
                aria-label={`Repeat mode: ${player.repeat === "one" ? "Repeat One" : "Continuous Queue"}`}
                title={`Repeat: ${player.repeat === "one" ? "Repeat One" : "Continuous Queue"}`}
                className="grid size-9 place-items-center rounded-full transition-all cursor-pointer text-teal-400 bg-teal-400/10 drop-shadow-[0_0_8px_rgba(45,212,191,0.5)]"
              >
                {player.repeat === "one" ? (
                  <Repeat1 className="size-4.5" />
                ) : (
                  <Repeat className="size-4.5" />
                )}
              </motion.button>
            </div>

            {/* Right: Volume Controls */}
            <div className="flex items-center justify-end w-1/4">
              <VolumeControl
                volume={player.volume}
                muted={player.muted}
                setVolume={player.setVolume}
                toggleMute={player.toggleMute}
              />
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
