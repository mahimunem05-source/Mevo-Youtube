import { memo, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { Play, Pause, Flame, MoreVertical, FolderPlus, Heart, TrendingUp, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatTime,
  isSongExplicit,
  type NavigationSource,
  type QueueSource,
  type Song,
} from "@/data/songs";
import { usePlayer } from "@/lib/player-context";
import { useNavigationHistory } from "@/lib/navigation-history";
import { useSettings } from "@/context/SettingsContext";
import { usePlaylists } from "@/context/PlaylistContext";
import { shareContent } from "@/lib/share";
import { toast } from "sonner";
import { Equalizer } from "./equalizer";
import { SongCoverImage } from "./song-cover-image";

interface Props {
  song: Song;
  /**
   * Smaller footprint for grid/"See All" pages — fills its grid cell
   * instead of the fixed carousel width, with a permanent soft glow so it
   * still reads as a premium card rather than a plain thumbnail.
   */
  compact?: boolean;
  /** When provided, the play button uses the full collection as the queue instead of a single-song fallback. */
  collectionSongs?: Song[];
  collectionIndex?: number;
  queueSource?: QueueSource;
  navigationSource?: NavigationSource;
}

/** Reusable album card with 3D lift, image zoom and an animated play control. */
function SongCardComponent({
  song,
  compact = false,
  collectionSongs,
  collectionIndex,
  queueSource,
  navigationSource,
}: Props) {
  const {
    current,
    isPlaying,
    queueSource: activeQueueSource,
    play,
    playFromCollection,
    toggle,
    addToQueue,
    toggleLike,
    isLiked,
  } = usePlayer();
  const { settings } = useSettings();
  const { openAddToPlaylistModal } = usePlaylists();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [showMenu]);

  const isCurrent = current?.id === song.id;
  const playingNow = isCurrent && isPlaying;
  const isExplicit = isSongExplicit(song);
  const isBlocked = !settings.allowExplicitContent && isExplicit;
  const liked = isLiked(song.id);

  const isSameCollection =
    activeQueueSource?.type === queueSource?.type && activeQueueSource?.id === queueSource?.id;

  const startFromCollection = () => {
    if (isBlocked) {
      toast.info("Explicit content is disabled in your Settings.");
      return;
    }

    const isMahiSelect =
      queueSource?.id === "mahi_select" ||
      queueSource?.id === "mahi-select" ||
      queueSource?.id === "mahis-favourite" ||
      queueSource?.id === "favourite" ||
      queueSource?.title === "Mahi Select" ||
      song.section === "favourite" ||
      song.category === "Mahi Select";

    if (collectionSongs && collectionSongs.length > 0 && queueSource) {
      const safeIndex =
        collectionIndex !== undefined && collectionIndex >= 0
          ? collectionIndex
          : collectionSongs.findIndex((item) => item.id === song.id);

      playFromCollection(
        collectionSongs,
        safeIndex >= 0 ? safeIndex : 0,
        queueSource,
        navigationSource,
        isMahiSelect ? "mahi_select" : undefined,
      );

      return;
    }

    play(song, navigationSource, isMahiSelect ? "mahi_select" : undefined);
  };

  const handlePlay = () => {
    if (isBlocked) {
      toast.info("Explicit content is disabled in your Settings.");
      return;
    }
    if (isCurrent && isSameCollection) {
      toggle();
      return;
    }

    startFromCollection();
  };

  const { recordPlayerSource } = useNavigationHistory();

  const handleCardNavigate = (event: React.MouseEvent) => {
    if (isBlocked) {
      event.preventDefault();
      toast.info("Explicit content is disabled in your Settings.");
      return;
    }
    recordPlayerSource();
    if (isCurrent && isSameCollection) {
      return;
    }
    event.preventDefault();
    startFromCollection();
  };

  return (
    <motion.article
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 450, damping: 25, mass: 0.8 }}
      className={cn(
        "group relative rounded-2xl border border-white/[0.06] bg-card/90 p-2 shadow-lg transition-all hover:border-white/[0.14] sm:rounded-3xl sm:p-3 active:opacity-90",
        compact ? "w-full" : "shrink-0",
        !compact &&
          "w-[calc((100vw-2.25rem)/3)] min-w-[104px] max-w-[128px] sm:w-48 md:w-52 lg:w-48 xl:w-52 2xl:w-56",
        isBlocked && "opacity-60 grayscale-[30%]",
      )}
    >
      <Link
        to="/song/$songId"
        params={{ songId: song.id }}
        preload="intent"
        onClick={handleCardNavigate}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${song.title} by ${song.artist}`}
      >
        <div className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-[#182227]">
          <SongCoverImage
            src={song.cover}
            alt={`${song.album} album artwork`}
            width={800}
            height={800}
            loading="eager"
            decoding="auto"
            className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60 transition-opacity group-hover:opacity-80" />

          {song.trending && (
            <span
              className={cn(
                "absolute left-1.5 top-1.5 inline-flex items-center gap-0.5 rounded-full bg-primary font-semibold text-primary-foreground sm:left-2.5 sm:top-2.5",
                compact
                  ? "px-1.5 py-0.5 text-[9px]"
                  : "px-1.5 py-0.5 text-[9px] sm:px-2 sm:py-0.5 sm:text-[10px]",
              )}
            >
              <Flame className={compact ? "size-2.5" : "size-2.5 sm:size-3"} />
              <span className="hidden xs:inline">Trending</span>
            </span>
          )}

          {playingNow && (
            <span className="absolute right-1.5 top-1.5 rounded-full bg-black/80 px-1.5 py-1 sm:right-2.5 sm:top-2.5 sm:px-2 sm:py-1">
              <Equalizer />
            </span>
          )}

          <motion.button
            type="button"
            aria-label={playingNow ? `Pause ${song.title}` : `Play ${song.title}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handlePlay();
            }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.92 }}
            className={cn(
              "absolute bottom-2 right-2 sm:bottom-2.5 sm:right-2.5 flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer z-10",
              "bg-[#2ee0b5] text-[#0d1617] shadow-md shadow-teal-500/25",
              playingNow
                ? "opacity-100 scale-100 shadow-[0_0_16px_rgba(46,224,181,0.6)]"
                : "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 hover:scale-105 active:scale-95",
              compact ? "size-7" : "size-7 xs:size-8 sm:size-9 md:size-10",
            )}
          >
            {playingNow ? (
              <Pause
                className={
                  compact ? "size-3.5 fill-current" : "size-3.5 sm:size-4 md:size-4.5 fill-current"
                }
              />
            ) : (
              <Play
                className={cn(
                  "fill-current translate-x-0.5",
                  compact ? "size-3.5" : "size-3.5 sm:size-4 md:size-4.5",
                )}
              />
            )}
          </motion.button>
        </div>

        <div className="mt-2 space-y-0.5 px-0.5 sm:mt-2.5 sm:space-y-1">
          <h3
            className={cn(
              "flex items-center gap-1 truncate font-bold tracking-tight text-foreground transition-colors group-hover:text-primary",
              compact ? "text-[11px]" : "text-xs sm:text-sm",
            )}
          >
            <span className="truncate">{song.title}</span>
            {isExplicit && (
              <span className="shrink-0 rounded bg-white/10 px-1 py-0.2 text-[9px] font-bold text-zinc-400">
                E
              </span>
            )}
          </h3>

          <p
            className={cn(
              "truncate text-muted-foreground",
              compact ? "text-[10px]" : "text-xs sm:text-xs",
            )}
          >
            {song.artist}
          </p>

          <div className="flex items-center justify-between pt-0.5 relative">
            <p
              className={cn(
                "text-muted-foreground/70",
                compact ? "text-[9px]" : "text-[10px] sm:text-xs",
              )}
            >
              {formatTime(song.duration)}
            </p>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                aria-label={`More options for ${song.title}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowMenu((prev) => !prev);
                }}
                className="-mr-0.5 grid h-5 w-5 place-items-center rounded-full text-muted-foreground/60 transition-colors hover:text-primary cursor-pointer"
              >
                <MoreVertical className={compact ? "size-3" : "size-3 sm:size-3.5"} />
              </button>

              <AnimatePresence>
                {showMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.92, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 bottom-full mb-1 z-50 min-w-44 rounded-2xl bg-[#12191D]/95 border border-[#4FD1C5]/30 p-1.5 shadow-2xl backdrop-blur-xl text-white"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowMenu(false);
                        openAddToPlaylistModal(song);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10 hover:text-teal-300 transition-colors cursor-pointer"
                    >
                      <FolderPlus className="size-3.5 text-teal-400" />
                      <span>Add to Playlist</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowMenu(false);
                        addToQueue(song);
                        toast.success(`Added "${song.title}" to queue`);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10 hover:text-teal-300 transition-colors cursor-pointer"
                    >
                      <TrendingUp className="size-3.5 text-teal-400" />
                      <span>Add to Queue</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowMenu(false);
                        toggleLike(song);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10 hover:text-teal-300 transition-colors cursor-pointer"
                    >
                      <Heart
                        className={cn(
                          "size-3.5",
                          liked ? "fill-teal-400 text-teal-400" : "text-teal-400"
                        )}
                      />
                      <span>{liked ? "Remove Like" : "Favorite"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowMenu(false);
                        await shareContent({
                          title: `${song.title} — ${song.artist}`,
                          text: `Listening to ${song.title} on MEVO`,
                          url: `${window.location.origin}/song/${song.id}`,
                        });
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10 hover:text-teal-300 transition-colors cursor-pointer"
                    >
                      <Share2 className="size-3.5 text-teal-400" />
                      <span>Share</span>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </Link>
    </motion.article>
  );
}

export const SongCard = memo(SongCardComponent);
