import { useState, useMemo, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  LoaderCircle,
  Music2,
  Play,
  Pause,
  EllipsisVertical,
  ChevronRight,
  TrendingUp,
  Flame,
  Plus,
  Heart,
  FolderPlus,
} from "lucide-react";
import {
  getTrendingSongs,
  getSongs,
  type TrendingSong as DatabaseTrendingSong,
  type Song as DatabaseSong,
} from "@/services/songService";
import { databaseSongToPlayerSong } from "@/lib/song-adapter";
import { subscribeToRealtimeChanges } from "@/lib/realtime-helper";
import { usePlayer } from "@/lib/player-context";
import { usePlaylists } from "@/context/PlaylistContext";
import { formatTime, type Song } from "@/data/songs";
import { cn } from "@/lib/utils";
import { SongCoverImage } from "@/components/music/song-cover-image";

import { fetchYouTubeTrending } from "@/services/youtube";

export const Route = createFileRoute("/trending")({
  head: () => ({
    meta: [
      { title: "MEVO Pulse — Trending Now" },
      {
        name: "description",
        content: "What's hot right now on MEVO.",
      },
      { property: "og:title", content: "MEVO Pulse — Trending Now" },
      {
        property: "og:description",
        content: "What's hot right now on MEVO.",
      },
    ],
  }),
  component: TrendingPage,
});

type FilterType = "Top 10" | "Weekly Trending" | "New Releases" | "Most Played";

const FILTER_CHIPS: FilterType[] = ["Top 10", "Weekly Trending", "New Releases", "Most Played"];

function TrendingPage() {
  const player = usePlayer();
  const { openAddToPlaylistModal } = usePlaylists();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<FilterType>("Top 10");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const ytTrendingQuery = useQuery({
    queryKey: ["trending-youtube-chart"],
    queryFn: () => fetchYouTubeTrending("BD", 50, "bangla", "MEVO Pulse"),
    staleTime: import.meta.env.DEV ? 0 : 1000 * 60 * 15,
    gcTime: import.meta.env.DEV ? 0 : 1000 * 60 * 60,
    placeholderData: import.meta.env.DEV ? undefined : keepPreviousData,
  });

  const trendingQuery = useQuery({
    queryKey: ["homepage-trending"],
    queryFn: getTrendingSongs,
    staleTime: import.meta.env.DEV ? 0 : 1000 * 60 * 15,
    gcTime: import.meta.env.DEV ? 0 : 1000 * 60 * 60,
    placeholderData: import.meta.env.DEV ? undefined : keepPreviousData,
  });

  const songsQuery = useQuery({
    queryKey: ["homepage-songs"],
    queryFn: getSongs,
    staleTime: import.meta.env.DEV ? 0 : 1000 * 60 * 15,
    gcTime: import.meta.env.DEV ? 0 : 1000 * 60 * 60,
    placeholderData: import.meta.env.DEV ? undefined : keepPreviousData,
  });

  const ytTrending = ytTrendingQuery.data ?? [];
  const databaseTrending = trendingQuery.data ?? [];
  const allCatalogue = songsQuery.data ?? [];
  const isLoading = (ytTrendingQuery.isLoading || trendingQuery.isLoading) && ytTrending.length === 0 && databaseTrending.length === 0;
  const loadError =
    ytTrendingQuery.error instanceof Error
      ? ytTrendingQuery.error.message
      : trendingQuery.error instanceof Error
        ? trendingQuery.error.message
        : "";

  useEffect(() => {
    return subscribeToRealtimeChanges("trending-page-relations", [
      {
        table: "trending_songs",
        callback: () => {
          void queryClient.invalidateQueries({
            queryKey: ["homepage-trending"],
            refetchType: "none",
          });
        },
      },
      {
        table: "songs",
        callback: () => {
          void queryClient.invalidateQueries({ queryKey: ["homepage-songs"], refetchType: "none" });
        },
      },
    ]);
  }, [queryClient]);

  const trendingList = useMemo(() => {
    let rawList: Song[] = [];

    if (ytTrending.length > 0) {
      rawList = ytTrending;
    } else if (databaseTrending.length > 0) {
      rawList = databaseTrending.map((song) => databaseSongToPlayerSong(song, { trending: true }));
    } else {
      rawList = allCatalogue.map((song) => databaseSongToPlayerSong(song));
    }

    if (activeFilter === "Weekly Trending") {
      return [...rawList].reverse();
    }
    if (activeFilter === "New Releases") {
      return [...rawList].sort((a, b) => (b.year || 0) - (a.year || 0));
    }
    if (activeFilter === "Most Played") {
      return [...rawList].sort((a, b) => (b.play_count || b.plays || 0) - (a.play_count || a.plays || 0));
    }

    // Top 10 by default
    return rawList.slice(0, 10);
  }, [ytTrending, databaseTrending, allCatalogue, activeFilter]);

  const handleRowClick = (song: Song, index: number) => {
    const isCurrent = player.current?.id === song.id;
    if (isCurrent) {
      player.toggle();
      return;
    }

    player.playFromCollection(trendingList, index, {
      type: "trending",
      id: "trending",
      title: "Trending Now",
    });
  };

  return (
    <div className="pb-36 pt-2 sm:pt-4 px-3 sm:px-6 max-w-3xl mx-auto">
      {/* 1. PAGE HEADING */}
      <header className="mb-3">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.25em] text-teal-400">
          TRENDING
        </p>
        <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-white mt-0.5">
          Trending Now
        </h1>
        <p className="text-xs text-white/60 mt-0.5 sm:text-sm">What’s hot right now on MEVO.</p>
      </header>

      {/* 2. TRENDING FILTER CHIPS (Single horizontal row, scrollable) */}
      <div className="carousel-track no-scrollbar flex items-center gap-2 overflow-x-auto py-1 mb-4 flex-nowrap">
        {FILTER_CHIPS.map((chip) => {
          const active = activeFilter === chip;
          return (
            <motion.button
              key={chip}
              whileTap={{ scale: 0.95 }}
              onClick={() => setActiveFilter(chip)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 transition-all duration-200",
                active
                  ? "bg-[#4FD1C5]/20 border border-[#4FD1C5] text-teal-400 font-semibold shadow-sm"
                  : "bg-[#182227]/80 border border-white/10 text-white/70 hover:text-white",
              )}
            >
              {chip}
            </motion.button>
          );
        })}
      </div>

      {/* Loading Indicator */}
      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-white/60">
          <LoaderCircle className="size-4 animate-spin text-teal-400" />
          Loading trending charts...
        </div>
      )}

      {/* Error Message */}
      {loadError && (
        <p className="py-4 text-xs font-semibold text-red-400" role="alert">
          {loadError}
        </p>
      )}

      {/* Empty State */}
      {!isLoading && trendingList.length === 0 && (
        <div className="rounded-3xl border border-white/10 bg-[#12191D]/90 p-8 text-center">
          <Music2 className="mx-auto mb-2 size-7 text-white/40" />
          <p className="font-semibold text-white text-sm">No trending songs found</p>
          <p className="mt-1 text-xs text-white/60">
            Publish songs or update charts from the Admin Panel.
          </p>
        </div>
      )}

      {/* 3. RANKED TRENDING SONG LIST */}
      {!isLoading && trendingList.length > 0 && (
        <div className="rounded-3xl border border-white/[0.08] bg-[#12191D]/90 p-2 sm:p-3 shadow-xl space-y-1">
          {trendingList.map((song, index) => {
            const rankNumber = index + 1;
            const isCurrent = player.current?.id === song.id;
            const isPlaying = isCurrent && player.isPlaying;
            const menuOpen = openMenuId === song.id;

            return (
              <div
                key={song.id}
                className={cn(
                  "group relative flex items-center justify-between rounded-2xl p-2 transition-all duration-200 cursor-pointer select-none",
                  isCurrent ? "bg-[#182227] border border-[#4FD1C5]/40" : "hover:bg-white/[0.04]",
                )}
                onClick={() => handleRowClick(song, index)}
              >
                {/* Left side: Rank + Cover + Info */}
                <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3 pr-2">
                  {/* Rank Number */}
                  <span className="font-mono text-sm font-extrabold text-teal-400 w-6 shrink-0 text-center">
                    {rankNumber}
                  </span>

                  {/* Album Cover */}
                  <div className="relative size-11 sm:size-12 shrink-0 overflow-hidden rounded-lg border border-white/10">
                    <SongCoverImage
                      src={song.cover}
                      alt=""
                      width={48}
                      height={48}
                      loading="eager"
                      decoding="auto"
                      className="size-full object-cover"
                    />
                  </div>

                  {/* Song Title & Artist */}
                  <div className="min-w-0 flex-1">
                    <h2
                      className={cn(
                        "truncate text-sm font-bold",
                        isCurrent ? "text-teal-400" : "text-white",
                      )}
                    >
                      {song.title}
                    </h2>
                    <p className="truncate text-xs text-white/60 mt-0.5">{song.artist}</p>
                  </div>
                </div>

                {/* Right side: Duration + Circular Play Button + More Menu */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Duration */}
                  <span className="text-xs tabular-nums text-white/60 shrink-0">
                    {formatTime(song.duration)}
                  </span>

                  {/* Circular Play / Pause Button with Thin Teal Outline */}
                  <button
                    type="button"
                    aria-label={isPlaying ? `Pause ${song.title}` : `Play ${song.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRowClick(song, index);
                    }}
                    className={cn(
                      "grid size-8 place-items-center rounded-full border transition-all duration-200 shrink-0",
                      isPlaying
                        ? "border-[#4FD1C5] bg-[#4FD1C5] text-[#071012] shadow-[0_0_12px_rgba(79,209,197,0.4)]"
                        : "border-[#4FD1C5]/60 text-teal-400 hover:bg-[#4FD1C5] hover:text-[#071012]",
                    )}
                  >
                    {isPlaying ? (
                      <Pause className="size-3.5 fill-current" />
                    ) : (
                      <Play className="size-3.5 translate-x-0.5 fill-current" />
                    )}
                  </button>

                  {/* Three-dot menu button */}
                  <div className="relative">
                    <button
                      type="button"
                      aria-label={`Options for ${song.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuId(menuOpen ? null : song.id);
                      }}
                      className="grid size-7 place-items-center rounded-full text-white/50 hover:text-white transition-colors"
                    >
                      <EllipsisVertical className="size-4" />
                    </button>

                    {/* Options Dropdown Menu */}
                    <AnimatePresence>
                      {menuOpen && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -4 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 top-8 z-50 min-w-36 rounded-xl bg-[#182227] border border-[#4FD1C5]/30 p-1.5 shadow-2xl"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              player.playNext(song);
                              setOpenMenuId(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                          >
                            <Plus className="size-3.5 text-teal-400" /> Play Next
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              openAddToPlaylistModal(song);
                              setOpenMenuId(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                          >
                            <FolderPlus className="size-3.5 text-teal-400" /> Add to Playlist
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              player.addToQueue(song);
                              setOpenMenuId(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                          >
                            <TrendingUp className="size-3.5 text-teal-400" /> Add to Queue
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              player.toggleLike(song);
                              setOpenMenuId(null);
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                          >
                            <Heart
                              className={cn(
                                "size-3.5",
                                player.isLiked(song.id)
                                  ? "fill-teal-400 text-teal-400"
                                  : "text-teal-400",
                              )}
                            />{" "}
                            Favourite
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. TRENDING UPDATE CARD */}
      <div className="mt-4 rounded-2xl border border-white/[0.08] bg-[#12191D]/90 p-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3 min-w-0">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#182227] text-teal-400">
            <Flame className="size-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-teal-400 truncate">Trending Update</h3>
            <p className="text-[11px] text-white/70 truncate mt-0.5">
              New charts every day at 12:00 AM.
            </p>
          </div>
        </div>
        <ChevronRight className="size-4 text-teal-400/80 shrink-0 ml-2" />
      </div>
    </div>
  );
}
