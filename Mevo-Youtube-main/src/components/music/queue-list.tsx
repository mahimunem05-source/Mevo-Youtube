import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  ChevronDown,
  ChevronUp,
  EllipsisVertical,
  GripVertical,
  Trash2,
  Music,
  LoaderCircle,
} from "lucide-react";
import { formatTime, type Song } from "@/data/songs";
import { usePlayer } from "@/lib/player-context";
import { cn } from "@/lib/utils";
import { Equalizer } from "./equalizer";
import { SongCoverImage } from "./song-cover-image";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useTranslation } from "@/hooks/useTranslation";
import {
  searchValidMusicVideos,
  searchValidMusicVideosPaginated,
  generateRadioQueue,
} from "@/lib/youtube-radio";
import {
  cleanYouTubeTitle,
  deduplicateYouTubeTracks,
  deduplicateCoreSongVariations,
} from "@/services/youtube";

const YOUTUBE_BATCH_SIZE = 12;

function getSafeString(val: unknown, fallback = ""): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if (typeof obj.title === "string") return obj.title;
    if (typeof obj.name === "string") return obj.name;
    if (typeof obj.artist === "string") return obj.artist;
  }
  return val ? String(val) : fallback;
}

export function QueueList({ song }: { song: Song }) {
  const {
    queue,
    currentIndex,
    current,
    isPlaying,
    playbackSource,
    queueSource,
    playQueueIndex,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    appendSongsToQueue,
  } = usePlayer();

  const isMahiSelect =
    playbackSource === "mahi_select" ||
    queueSource?.id === "mahi_select" ||
    queueSource?.id === "mahi-select" ||
    queueSource?.id === "mahis-favourite" ||
    queueSource?.id === "favourite" ||
    queueSource?.title === "Mahi Select";

  const isCustomPlaylist =
    playbackSource === "custom_playlist" ||
    queueSource?.type === "playlist" ||
    (typeof queueSource?.id === "string" &&
      (queueSource.id.startsWith("playlist-") || queueSource.id.startsWith("custom-")));

  const isFixedQueue =
    isMahiSelect ||
    isCustomPlaylist ||
    playbackSource === "manual" ||
    playbackSource === "album" ||
    playbackSource === "playlist" ||
    queueSource?.type === "album" ||
    queueSource?.type === "playlist";

  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeRowRef = useRef<HTMLLIElement | null>(null);
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [hasMorePages, setHasMorePages] = useState(true);

  // Active track reference (prefer current from context, fallback to song prop)
  const activeTrack = current || song;

  const queryContextRef = useRef<string>("");
  const activeSeedIdRef = useRef<string>("");
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    tokenRef.current = nextPageToken;
  }, [nextPageToken]);

  // When active track changes, initialize query context for pagination
  useEffect(() => {
    const rawTrackId = (activeTrack?.id || "").replace(/^yt-/, "").trim();
    if (!rawTrackId || rawTrackId === activeSeedIdRef.current) return;
    activeSeedIdRef.current = rawTrackId;

    const seedArtist = (activeTrack?.artist || "").replace(/YouTube Artist|Unknown Artist/i, "").trim();
    const seedTitle = (activeTrack?.title || "").replace(/(\(|\[).*?(\)|\])/g, "").trim();
    const initialQuery = seedArtist
      ? `"${seedArtist}" "${seedTitle}" official audio`
      : `"${seedTitle}" official audio`;

    queryContextRef.current = initialQuery;
    setNextPageToken(null);
    tokenRef.current = null;
    setHasMorePages(true);
  }, [activeTrack?.id, activeTrack?.title, activeTrack?.artist]);

  // Track availability of additional recommendations:
  // Available for dynamic YouTube streams with active pages, hidden for static/fixed local collections
  const canLoadMore = !isFixedQueue && queue.length > 0 && hasMorePages;

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current?.id]);

  const handleSelect = (track: Song, index: number) => {
    const alreadyActive = current?.id === track.id && currentIndex === index;
    if (!alreadyActive) {
      playQueueIndex(index);
    }

    void navigate({
      to: "/song/$songId",
      params: { songId: track.id },
      replace: true,
    });
  };

  /**
   * Real YouTube API Up Next Pagination Handler
   * Requests the next page using YouTube Data API's nextPageToken, keeping search query context,
   * normalizing results, and appending new unique songs to the existing queue.
   */
  const handleLoadMore = async () => {
    if (isFixedQueue || isLoadingMore || !hasMorePages) return;

    setIsLoadingMore(true);
    try {
      const existingIds = new Set(
        queue.map((s) => (s.id || "").replace(/^yt-/, "").trim().toLowerCase())
      );

      // Determine query context: use queryContextRef or derive from seed track
      let query = queryContextRef.current;
      if (!query) {
        const lastTrack = queue.length > 0 ? queue[queue.length - 1] : activeTrack;
        const seedTrack = lastTrack || activeTrack;
        const seedArtist = (seedTrack?.artist || "").replace(/YouTube Artist|Unknown Artist/i, "").trim();
        const seedTitle = (seedTrack?.title || "").replace(/(\(|\[).*?(\)|\])/g, "").trim();
        query = seedArtist ? `"${seedArtist}" official audio songs` : `"${seedTitle}" official audio`;
        queryContextRef.current = query;
      }

      const currentToken = tokenRef.current;

      // 1. Fetch next page from YouTube API using searchValidMusicVideosPaginated
      const pageResult = await searchValidMusicVideosPaginated(
        query,
        YOUTUBE_BATCH_SIZE,
        "Up Next",
        currentToken
      );

      let fetchedSongs = pageResult.songs;
      let newNextPageToken = pageResult.nextPageToken;

      // Filter out any songs already present in the active queue
      let freshCandidates = fetchedSongs.filter((track) => {
        const rawId = (track.id || "").replace(/^yt-/, "").trim().toLowerCase();
        return rawId && !existingIds.has(rawId);
      });

      // If initial page or current query yielded few fresh items and another page exists,
      // request the subsequent page token automatically to deliver a complete batch
      if (freshCandidates.length < 4 && newNextPageToken && newNextPageToken !== currentToken) {
        try {
          const secondPage = await searchValidMusicVideosPaginated(
            query,
            YOUTUBE_BATCH_SIZE,
            "Up Next",
            newNextPageToken
          );
          if (secondPage.songs.length > 0) {
            const secondFresh = secondPage.songs.filter((track) => {
              const rawId = (track.id || "").replace(/^yt-/, "").trim().toLowerCase();
              return rawId && !existingIds.has(rawId);
            });
            freshCandidates = [...freshCandidates, ...secondFresh];
            newNextPageToken = secondPage.nextPageToken;
          }
        } catch {
          // Gracefully continue with candidates already collected
        }
      }

      // If query is completely exhausted and no candidates found, try chaining off the last track
      if (freshCandidates.length === 0 && (!newNextPageToken || newNextPageToken === currentToken)) {
        const lastTrack = queue.length > 0 ? queue[queue.length - 1] : activeTrack;
        const fallbackArtist = (lastTrack?.artist || "").replace(/YouTube Artist|Unknown Artist/i, "").trim();
        const fallbackQuery = fallbackArtist
          ? `songs like "${fallbackArtist}" official audio`
          : `top viral indie pop acoustic hits official audio`;

        if (fallbackQuery !== query) {
          queryContextRef.current = fallbackQuery;
          const chainedPage = await searchValidMusicVideosPaginated(
            fallbackQuery,
            YOUTUBE_BATCH_SIZE,
            "Up Next",
            null
          );
          freshCandidates = chainedPage.songs.filter((track) => {
            const rawId = (track.id || "").replace(/^yt-/, "").trim().toLowerCase();
            return rawId && !existingIds.has(rawId);
          });
          newNextPageToken = chainedPage.nextPageToken;
        }
      }

      // 2. Clean metadata & Deduplicate
      const cleanedFresh: Song[] = [];
      for (const track of freshCandidates) {
        const rawTitleStr = getSafeString(track.title, "Untitled Track");
        const rawArtistStr = getSafeString(
          track.artist || (track as any).channelTitle || (track as any).channel || (track as any).uploader,
          "YouTube Artist"
        );
        const parsed = cleanYouTubeTitle(rawTitleStr, rawArtistStr);

        cleanedFresh.push({
          ...track,
          title: parsed.title || rawTitleStr,
          artist: parsed.artist || rawArtistStr || "YouTube Artist",
        });
      }

      const uniqueBatch = deduplicateCoreSongVariations(
        deduplicateYouTubeTracks(cleanedFresh),
        0.70
      );

      // 3. Append new unique tracks to the queue (existing songs remain untouched)
      if (uniqueBatch.length > 0) {
        appendSongsToQueue(uniqueBatch);
      }

      // 4. Update pagination token state for the following request
      setNextPageToken(newNextPageToken);
      tokenRef.current = newNextPageToken;

      // When YouTube API has no more pages and 0 songs added, mark exhausted
      if (!newNextPageToken && uniqueBatch.length === 0) {
        setHasMorePages(false);
      }
    } catch (err) {
      console.warn("Failed to load more songs for queue:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <aside aria-label="Up next playback queue" className="w-full">
      {/* Header: UP NEXT (left) | CLEAR (right) */}
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-extrabold uppercase tracking-[0.25em] text-teal-400/90 flex items-center gap-1.5">
          <span>{t("player.upNext", "UP NEXT")}</span>
        </h2>
        {queue.length > 1 && (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="text-[11px] font-extrabold uppercase tracking-[0.25em] text-teal-400/90 hover:text-teal-300 transition-colors cursor-pointer"
          >
            {t("player.clear", "CLEAR")}
          </button>
        )}
      </header>

      {queue.length === 0 ? (
        <div className="py-8 text-center flex flex-col items-center justify-center gap-2 text-white/50">
          <Music className="size-6 text-white/30" />
          <p className="text-xs">No songs in queue.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {queue.map((track, index) => {
            const active = currentIndex === index && current?.id === track.id;
            const menuOpen = openMenuIndex === index;
            const rawArtistVal =
              track.artist ||
              (track as any).channelTitle ||
              (track as any).channel ||
              (track as any).uploader ||
              (track as any).videoOwnerChannelTitle ||
              (track as any).author ||
              "";
            let artistStr = getSafeString(rawArtistVal, "");
            let titleStr = getSafeString(track.title, "");

            if (!artistStr || artistStr === "Unknown Artist" || artistStr === "YouTube Artist") {
              if (titleStr) {
                const parsed = cleanYouTubeTitle(titleStr, "");
                if (parsed.artist && parsed.artist !== "YouTube Artist" && parsed.artist !== "Unknown Artist") {
                  artistStr = parsed.artist;
                  titleStr = parsed.title;
                }
              }
            }
            if (!artistStr) {
              artistStr = "YouTube Artist";
            }
            if (!titleStr) {
              titleStr = "Untitled Track";
            }

            return (
              <motion.li
                key={`${track.id}-${index}`}
                ref={active ? activeRowRef : undefined}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.02, 0.2) }}
                className="relative"
              >
                <div
                  className={cn(
                    "group relative flex w-full items-center rounded-xl p-2 transition-all duration-200",
                    active ? "bg-[#182227] border border-[#4FD1C5]/40" : "hover:bg-white/[0.05]",
                  )}
                >
                  {/* Drag handle icon on far left */}
                  <GripVertical className="size-4 shrink-0 text-white/30 mr-2.5" />

                  {/* Main song button */}
                  <button
                    type="button"
                    onClick={() => handleSelect(track, index)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    {/* Album cover */}
                    <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-black/40">
                      <SongCoverImage
                        src={track.cover}
                        alt=""
                        width={44}
                        height={44}
                        className="size-full object-cover"
                      />
                      {active && isPlaying && (
                        <div className="absolute inset-0 grid place-items-center bg-black/40">
                          <Equalizer />
                        </div>
                      )}
                    </div>

                    {/* Title & Artist */}
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm font-semibold",
                          active ? "text-teal-400" : "text-white/95",
                        )}
                      >
                        {titleStr}
                      </span>
                      <span className="block truncate text-xs text-white/60">{artistStr}</span>
                    </span>

                    {/* Duration */}
                    <span className="shrink-0 text-xs tabular-nums text-white/50 pr-1">
                      {formatTime(track.duration)}
                    </span>
                  </button>

                  {/* Three-dot options menu */}
                  <button
                    type="button"
                    aria-label={`Options for ${titleStr}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenuIndex(menuOpen ? null : index);
                    }}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <EllipsisVertical className="size-4" />
                  </button>

                  {/* Options Dropdown */}
                  <AnimatePresence>
                    {menuOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-2 top-12 z-50 min-w-36 rounded-xl bg-[#182227] border border-[#4FD1C5]/30 p-1.5 shadow-2xl"
                      >
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => {
                            reorderQueue(index, index - 1);
                            setOpenMenuIndex(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-40"
                        >
                          <ChevronUp className="size-3.5 text-teal-400" /> Move Up
                        </button>
                        <button
                          type="button"
                          disabled={index === queue.length - 1}
                          onClick={() => {
                            reorderQueue(index, index + 1);
                            setOpenMenuIndex(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white hover:bg-white/10 disabled:opacity-40"
                        >
                          <ChevronDown className="size-3.5 text-teal-400" /> Move Down
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            removeFromQueue(index);
                            setOpenMenuIndex(null);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="size-3.5" /> Remove
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}

      {/* "Load more" Button & End of Catalog Indicator */}
      <div className="mt-3 pt-1">
        {canLoadMore ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void handleLoadMore();
            }}
            disabled={isLoadingMore}
            className="w-full py-2.5 my-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-gray-300 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isLoadingMore ? (
              <>
                <LoaderCircle className="w-4 h-4 animate-spin text-[#00F0FF]" />
                <span>Loading...</span>
              </>
            ) : (
              <>
                <Music className="w-4 h-4 text-[#00F0FF]" />
                <span>Load more</span>
              </>
            )}
          </button>
        ) : (
          queue.length > 0 && (
            <div className="text-center py-2.5 space-y-1">
              {isMahiSelect ? (
                <p className="text-[11px] font-semibold text-teal-400/70 tracking-wide uppercase">
                  ✦ Mahi Select • {queue.length} Tracks
                </p>
              ) : isCustomPlaylist ? (
                <p className="text-[11px] font-semibold text-teal-400/70 tracking-wide uppercase">
                  ✦ {queueSource?.title || "Custom Album"} • {queue.length} {queue.length === 1 ? "Track" : "Tracks"}
                </p>
              ) : null}
              <p className="text-xs text-white/40 italic font-medium">
                You've reached the end of the catalog
              </p>
            </div>
          )
        )}
      </div>

      {/* Confirmation Dialog for Clearing Queue */}
      <ConfirmDialog
        open={showClearConfirm}
        title="Clear Up Next Queue?"
        description="Are you sure you want to remove all upcoming songs from your queue?"
        confirmText="Clear Queue"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          clearQueue();
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </aside>
  );
}

export default QueueList;
