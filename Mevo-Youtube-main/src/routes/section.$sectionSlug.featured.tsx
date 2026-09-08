import { useEffect, useMemo, useState } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  LoaderCircle,
  Music2,
  Play,
  Pause,
  Shuffle,
  EllipsisVertical,
  Plus,
  TrendingUp,
  Heart,
  FolderPlus,
} from "lucide-react";

import {
  belongsToSection,
  getDisplaySectionBySlug,
  formatTime,
  type SectionId,
  songs as runtimeSongs,
  type Song as PlayerSong,
} from "@/data/songs";
import {
  getSongs,
  getTrendingSongs,
  type Song as DatabaseSong,
  type TrendingSong as DatabaseTrendingSong,
} from "@/services/songService";
import { databaseSongToPlayerSong } from "@/lib/song-adapter";
import { getRankedPlayedSongs } from "@/services/listeningHistoryService";
import { supabase } from "@/lib/supabase";
import { subscribeToRealtimeChanges } from "@/lib/realtime-helper";
import { usePlayer } from "@/lib/player-context";
import { usePlaylists } from "@/context/PlaylistContext";
import { shuffleArray, getFeaturedSongsForSection } from "@/lib/collection-utils";
import { SongCoverImage } from "@/components/music/song-cover-image";
import { AppBackButton } from "@/components/music/app-back-button";
import { Equalizer } from "@/components/music/equalizer";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/section/$sectionSlug/featured")({
  loader: ({ params }) => {
    const section = getDisplaySectionBySlug(params.sectionSlug);

    if (!section) {
      throw notFound();
    }

    return { section };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Featured Collection not found — MEVO" },
          { name: "robots", content: "noindex" },
        ],
      };
    }

    const { section } = loaderData;

    return {
      meta: [
        { title: `Featured in ${section.title} — MEVO` },
        {
          name: "description",
          content: `Recommended featured tracks selected from ${section.title}.`,
        },
        { property: "og:title", content: `Featured in ${section.title} — MEVO` },
        {
          property: "og:description",
          content: `Recommended featured tracks selected from ${section.title}.`,
        },
      ],
    };
  },
  component: SectionFeaturedPage,
});

function SectionFeaturedPage() {
  const { section } = Route.useLoaderData();
  const player = usePlayer();
  const { openAddToPlaylistModal } = usePlaylists();

  const [databaseSongs, setDatabaseSongs] = useState<DatabaseSong[]>([]);
  const [trendingSongs, setTrendingSongs] = useState<DatabaseTrendingSong[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const isMahiSelect =
    section.id === "favourite" ||
    section.slug === "mahis-favourite" ||
    section.slug === "mahi-select";

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        setIsLoading(true);
        setLoadError("");

        const [songsData, trendingData] = await Promise.all([
          isMahiSelect
            ? supabase
                .from("songs")
                .select("*")
                .order("created_at", { ascending: false })
                .then((res) => (res.data ?? []) as DatabaseSong[])
            : getSongs(),
          getTrendingSongs(),
        ]);

        if (isMounted) {
          setDatabaseSongs(songsData);
          setTrendingSongs(trendingData);
        }
      } catch (error) {
        if (isMounted) {
          console.error("Could not load featured songs:", error);
          setLoadError(error instanceof Error ? error.message : "Could not load featured tracks.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadData();

    const cleanup = subscribeToRealtimeChanges(`featured-page-${section.id}`, [
      {
        table: "songs",
        callback: () => void loadData(),
      },
      {
        table: "trending_songs",
        callback: () => void loadData(),
      },
    ]);

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [section.id, isMahiSelect]);

  const allCatalogueSongs = useMemo<PlayerSong[]>(() => {
    const dbConverted = databaseSongs.map((s) => databaseSongToPlayerSong(s));
    return dbConverted.length > 0 ? dbConverted : runtimeSongs;
  }, [databaseSongs]);

  const sectionSongs = useMemo<PlayerSong[]>(() => {
    if (isMahiSelect) {
      return databaseSongs.map((s) => databaseSongToPlayerSong(s));
    }
    if (section.id === "quick-picks") {
      return allCatalogueSongs;
    }
    if (section.id === "recently-played") {
      return getRankedPlayedSongs(allCatalogueSongs, player.recent, 100).map((item) => item.song);
    }
    if (section.id === "trending") {
      return trendingSongs.map((s) => databaseSongToPlayerSong(s, { trending: true }));
    }
    return databaseSongs
      .map((s) => databaseSongToPlayerSong(s))
      .filter((s) => belongsToSection(s, section.id as SectionId));
  }, [isMahiSelect, section.id, databaseSongs, trendingSongs, player.recent, allCatalogueSongs]);

  const trendingIds = useMemo(() => new Set(trendingSongs.map((s) => s.id)), [trendingSongs]);

  // Load curated recommendations for dedicated featured page
  const featuredSongs = useMemo(() => {
    return getFeaturedSongsForSection(section.id, sectionSongs, allCatalogueSongs, trendingIds, 50);
  }, [section.id, sectionSongs, allCatalogueSongs, trendingIds]);

  const queueSource = useMemo(
    () => ({
      type: "section" as const,
      id: isMahiSelect ? "mahi-select-featured" : `${section.id}-featured`,
      title: `Featured in ${isMahiSelect ? "Mahi Select" : section.title}`,
    }),
    [isMahiSelect, section.id, section.title],
  );

  const navigationSource = useMemo(
    () => ({
      ...queueSource,
      pathname: `/section/${section.slug}/featured`,
      label: `Featured in ${isMahiSelect ? "Mahi Select" : section.title}`,
    }),
    [queueSource, section.slug, section.title, isMahiSelect],
  );

  const isCurrentPlaying = player.queueSource?.id === queueSource.id && player.current !== null;

  const isShuffleActive = isCurrentPlaying && player.shuffle;

  const handlePlayAll = () => {
    if (featuredSongs.length > 0) {
      player.playFromCollection(
        featuredSongs,
        0,
        queueSource,
        navigationSource,
        isMahiSelect ? "mahi_select" : undefined,
      );
    }
  };

  const handleShuffle = () => {
    if (featuredSongs.length === 0) return;
    if (isCurrentPlaying) {
      player.toggleShuffle();
    } else {
      const shuffled = shuffleArray(featuredSongs);
      player.playFromCollection(
        shuffled,
        0,
        queueSource,
        navigationSource,
        isMahiSelect ? "mahi_select" : undefined,
      );
      if (!player.shuffle) {
        player.toggleShuffle();
      }
    }
  };

  return (
    <div className="relative min-h-screen text-foreground pb-4 sm:pb-6">
      {/* Background Lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 inset-x-0 h-[400px] sm:h-[440px] overflow-hidden -z-10"
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, color-mix(in oklab, var(--background) 30%, transparent), color-mix(in oklab, var(--background) 80%, transparent), var(--background))",
          }}
        />
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 md:px-12 pt-3 sm:pt-4">
        {/* Back Button */}
        <div className="mb-3">
          <AppBackButton fallbackTo={`/section/${section.slug}`} />
        </div>

        {/* Page Header Block */}
        <header className="mb-6">
          <p className="text-[10px] sm:text-xs font-extrabold uppercase tracking-[0.2em] text-teal-400">
            FEATURED COLLECTION
          </p>
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mt-1">
            Featured in {section.title}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Recommended tracks selected from this collection.
          </p>
          <p className="text-[11px] text-muted-foreground/80 mt-1">
            {featuredSongs.length} {featuredSongs.length === 1 ? "song" : "songs"}
          </p>

          {/* Action Controls */}
          <div className="mt-4 flex items-center gap-3">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={handlePlayAll}
              disabled={featuredSongs.length === 0}
              className="flex items-center gap-2 rounded-full bg-[#4FD1C5] px-5 sm:px-6 py-2.5 text-xs sm:text-sm font-extrabold text-[#071012] shadow-[0_0_20px_rgba(79,209,197,0.4)] transition-all hover:bg-[#4FD1C5]/90 disabled:opacity-50"
            >
              <Play className="size-4 fill-current translate-x-0.5" />
              Play All
            </motion.button>

            <button
              type="button"
              onClick={handleShuffle}
              disabled={featuredSongs.length === 0}
              aria-label={isShuffleActive ? "Shuffle is on" : "Shuffle is off"}
              title={isShuffleActive ? "Shuffle On" : "Shuffle Off"}
              className={cn(
                "flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-semibold transition-all duration-200 cursor-pointer disabled:opacity-50",
                isShuffleActive
                  ? "border-[#4FD1C5] bg-[#4FD1C5]/20 text-[#4FD1C5] shadow-[0_0_15px_rgba(79,209,197,0.35)] hover:bg-[#4FD1C5]/25"
                  : "border-white/10 bg-white/[0.06] text-white/80 hover:bg-white/15 hover:text-white",
              )}
            >
              <Shuffle
                className={cn(
                  "size-4 transition-colors",
                  isShuffleActive ? "text-[#4FD1C5]" : "text-white/80",
                )}
              />
              <span>Shuffle</span>
            </button>
          </div>
        </header>

        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-white/60">
            <LoaderCircle className="size-4 animate-spin text-teal-400" />
            Loading featured tracks...
          </div>
        )}

        {/* Load Error */}
        {loadError && (
          <p className="py-4 text-xs font-semibold text-red-400" role="alert">
            {loadError}
          </p>
        )}

        {/* Track List */}
        {!isLoading && featuredSongs.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-[#12191D]/90 p-8 text-center">
            <Music2 className="mx-auto mb-2 size-7 text-white/40" />
            <p className="font-semibold text-white text-sm">No featured songs found</p>
          </div>
        ) : (
          !isLoading && (
            <div className="rounded-3xl border border-white/[0.08] bg-[#12191D]/90 p-2 sm:p-3 shadow-xl space-y-1">
              {featuredSongs.map((song, index) => {
                const trackNumber = String(index + 1).padStart(2, "0");
                const isCurrent = player.current?.id === song.id;
                const isPlaying = isCurrent && player.isPlaying;
                const menuOpen = openMenuId === song.id;

                return (
                  <div
                    key={song.id}
                    className={cn(
                      "group relative flex items-center justify-between rounded-2xl p-2 transition-all duration-200 cursor-pointer select-none",
                      isCurrent
                        ? "bg-[#182227] border border-[#4FD1C5]/40"
                        : "hover:bg-white/[0.04]",
                    )}
                    onClick={() =>
                      player.playFromCollection(
                        featuredSongs,
                        index,
                        queueSource,
                        navigationSource,
                        isMahiSelect ? "mahi_select" : undefined,
                      )
                    }
                  >
                    {/* Left side: Track # / Equalizer + Cover + Title/Artist */}
                    <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3 pr-2">
                      <span className="w-6 shrink-0 text-center text-xs font-mono font-bold text-teal-400">
                        {isPlaying ? <Equalizer /> : null}
                      </span>

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

                      <div className="min-w-0 flex-1">
                        <h3
                          className={cn(
                            "truncate text-sm font-bold",
                            isCurrent ? "text-teal-400" : "text-white",
                          )}
                        >
                          {song.title}
                        </h3>
                        <p className="truncate text-xs text-white/60 mt-0.5">{song.artist}</p>
                      </div>
                    </div>

                    {/* Right side: Duration + Play button + Options menu */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs tabular-nums text-white/60 shrink-0">
                        {formatTime(song.duration)}
                      </span>

                      <button
                        type="button"
                        aria-label={isPlaying ? `Pause ${song.title}` : `Play ${song.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCurrent) {
                            player.toggle();
                          } else {
                            player.playFromCollection(
                              featuredSongs,
                              index,
                              queueSource,
                              navigationSource,
                              isMahiSelect ? "mahi_select" : undefined,
                            );
                          }
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

                      {/* Dropdown menu */}
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
                                Favorite
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
          )
        )}
      </div>
    </div>
  );
}
