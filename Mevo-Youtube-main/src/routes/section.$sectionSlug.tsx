import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import {
  LoaderCircle,
  Music2,
  Play,
  Pause,
  Shuffle,
  Heart,
  EllipsisVertical,
  ChevronRight,
  ChevronDown,
  Plus,
  TrendingUp,
  Share2,
  Info,
  User,
  Disc3,
  X,
  Search,
  FolderPlus,
} from "lucide-react";
import { LiveSearch } from "@/components/music/live-search";
import { SongCoverImage } from "@/components/music/song-cover-image";

import {
  belongsToSection,
  getDisplaySectionBySlug,
  formatTime,
  songs as runtimeSongs,
  type SectionId,
  type Song as PlayerSong,
} from "@/data/songs";
import {
  getSongs,
  getTrendingSongs,
  type Song as DatabaseSong,
  type TrendingSong as DatabaseTrendingSong,
} from "@/services/songService";
import { databaseSongToPlayerSong } from "@/lib/song-adapter";
import { getMostPlayedSongs, getRankedPlayedSongs } from "@/services/listeningHistoryService";
import { supabase } from "@/lib/supabase";
import { subscribeToRealtimeChanges } from "@/lib/realtime-helper";
import { usePlayer } from "@/lib/player-context";
import { usePlaylists } from "@/context/PlaylistContext";
import { useNavigationHistory } from "@/lib/navigation-history";
import {
  shuffleArray,
  sumDuration,
  getFeaturedSongsForSection,
  slugify,
} from "@/lib/collection-utils";
import { AppBackButton } from "@/components/music/app-back-button";
import { shareContent } from "@/lib/share";
import { Equalizer } from "@/components/music/equalizer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { HOME_SECTIONS } from "@/lib/category-config";
import {
  fetchYouTubeTrending,
  fetchYouTubeCategoryTracks,
  fetchPaginatedYouTubeCategoryTracks,
} from "@/services/youtube";
import { fetchExpandedUserQuickPicks } from "@/lib/user-taste";

export const Route = createFileRoute("/section/$sectionSlug")({
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
        meta: [{ title: "Collection not found — MEVO" }, { name: "robots", content: "noindex" }],
      };
    }

    const { section } = loaderData;

    return {
      meta: [
        { title: `${section.title} — MEVO` },
        { name: "description", content: section.subtitle },
        { property: "og:title", content: `${section.title} — MEVO` },
        { property: "og:description", content: section.subtitle },
      ],
    };
  },
  component: SectionDetailsPage,
});

const FAVORITE_SECTIONS_KEY = "mevo-favorite-sections";

function SectionDetailsPage() {
  const { section } = Route.useLoaderData();
  const player = usePlayer();
  const { openAddToPlaylistModal } = usePlaylists();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { recordPlayerSource } = useNavigationHistory();

  const sectionConfig = HOME_SECTIONS.find((s) => {
    if (s.id === section.id || s.id === section.slug) return true;
    if (section.id === "quick-picks" && (s.id === "quick-picks" || s.id === "trending")) return true;
    if (section.id === "trending" && s.id === "mevo-pulse") return true;
    if (section.id === "bangla" && s.id === "bengal-echo") return true;
    if (section.id === "hindi" && s.id === "hindi-reverie") return true;
    if (section.id === "english" && s.id === "english-essence") return true;
    if (section.id === "favourite" && s.id === "mahi-select") return true;
    if (section.id === "boost-aura" && s.id === "boost-aura") return true;
    if (section.id === "global" && s.id === "sonic-world") return true;
    return false;
  });

  const [paginatedSongs, setPaginatedSongs] = useState<PlayerSong[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [quickPicksPage, setQuickPicksPage] = useState(1);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const isFetchingRef = useRef(false);
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const nextPageTokenRef = useRef(nextPageToken);
  nextPageTokenRef.current = nextPageToken;
  const quickPicksPageRef = useRef(quickPicksPage);
  quickPicksPageRef.current = quickPicksPage;
  const paginatedSongsRef = useRef(paginatedSongs);
  paginatedSongsRef.current = paginatedSongs;

  // Dedicated Query for Quick Picks
  const quickPicksQuery = useQuery({
    queryKey: ["section-quick-picks-songs"],
    queryFn: () => fetchExpandedUserQuickPicks(1, 40),
    enabled: section.id === "quick-picks",
    staleTime: import.meta.env.DEV ? 0 : 1000 * 60 * 5,
    gcTime: import.meta.env.DEV ? 0 : 1000 * 60 * 60,
  });

  const prevSectionIdRef = useRef(section.id);
  useEffect(() => {
    if (prevSectionIdRef.current !== section.id) {
      prevSectionIdRef.current = section.id;
      setPaginatedSongs([]);
      setNextPageToken(null);
      setQuickPicksPage(1);
      setHasMore(true);
      isFetchingRef.current = false;
    }
  }, [section.id]);

  useEffect(() => {
    if (section.id === "quick-picks" && quickPicksQuery.data && paginatedSongs.length === 0) {
      setPaginatedSongs(quickPicksQuery.data);
      setHasMore(quickPicksQuery.data.length >= 10);
    }
  }, [section.id, quickPicksQuery.data, paginatedSongs.length]);

  const youtubeQuery = useQuery({
    queryKey: ["section-youtube-songs", section.id],
    queryFn: async () => {
      if (!sectionConfig || sectionConfig.source !== "youtube") return { songs: [], nextPageToken: null };
      if (sectionConfig.type === "chart" || sectionConfig.id === "mevo-pulse") {
        return fetchPaginatedYouTubeCategoryTracks(
          "top trending hindi bollywood english pop phonk viral official audio",
          "viewCount",
          20,
          null,
          "bangla",
          sectionConfig.title
        );
      }
      if (sectionConfig.type === "search" && sectionConfig.query) {
        return fetchPaginatedYouTubeCategoryTracks(
          sectionConfig.query,
          sectionConfig.order || "viewCount",
          20,
          null,
          section.id as SectionId,
          sectionConfig.title
        );
      }
      return { songs: [], nextPageToken: null };
    },
    enabled: Boolean(sectionConfig && sectionConfig.source === "youtube"),
    staleTime: import.meta.env.DEV ? 0 : 1000 * 60 * 15,
    gcTime: import.meta.env.DEV ? 0 : 1000 * 60 * 60,
  });

  useEffect(() => {
    if (section.id !== "quick-picks" && youtubeQuery.data?.songs && paginatedSongs.length === 0) {
      setPaginatedSongs(youtubeQuery.data.songs);
      setNextPageToken(youtubeQuery.data.nextPageToken || null);
      setHasMore(Boolean(youtubeQuery.data.nextPageToken || youtubeQuery.data.songs.length > 0));
    }
  }, [section.id, youtubeQuery.data, paginatedSongs.length]);

  const loadMoreTracks = useCallback(async () => {
    if (isFetchingRef.current || !hasMoreRef.current) return;

    if (section.id === "quick-picks") {
      isFetchingRef.current = true;
      setIsFetchingMore(true);
      try {
        const nextPage = quickPicksPageRef.current + 1;
        const newTracks = await fetchExpandedUserQuickPicks(nextPage, 20);
        if (newTracks.length > 0) {
          setPaginatedSongs((prev) => {
            const seen = new Set(prev.map((s) => s.id));
            const fresh = newTracks.filter((s) => !seen.has(s.id));
            return [...prev, ...fresh];
          });
          setQuickPicksPage(nextPage);
          setHasMore(newTracks.length >= 10);
        } else {
          setHasMore(false);
        }
      } catch (err) {
        console.warn("Quick picks load more error:", err);
        setHasMore(false);
      } finally {
        isFetchingRef.current = false;
        setIsFetchingMore(false);
      }
      return;
    }

    if (
      !sectionConfig ||
      sectionConfig.source !== "youtube"
    ) {
      setHasMore(false);
      return;
    }

    isFetchingRef.current = true;
    setIsFetchingMore(true);

    try {
      const query =
        sectionConfig.id === "mevo-pulse"
          ? "top trending hindi bollywood english pop phonk viral official audio"
          : sectionConfig.query || sectionConfig.title;

      const currentToken = nextPageTokenRef.current;

      const res = await fetchPaginatedYouTubeCategoryTracks(
        query,
        sectionConfig.order || "viewCount",
        20,
        currentToken,
        section.id as SectionId,
        sectionConfig.title
      );

      if (res.songs.length > 0) {
        setPaginatedSongs((prev) => {
          const seen = new Set(prev.map((s) => s.id));
          const newSongs = res.songs.filter((s) => !seen.has(s.id));
          return [...prev, ...newSongs];
        });
        setNextPageToken(res.nextPageToken || null);
        setHasMore(Boolean(res.nextPageToken && res.songs.length > 0));
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.warn("Manual load more error:", err);
      setHasMore(false);
    } finally {
      isFetchingRef.current = false;
      setIsFetchingMore(false);
    }
  }, [sectionConfig, section.id]);

  const isMahiSelect =
    section.id === "favourite" ||
    section.slug === "mahis-favourite" ||
    section.slug === "mahi-select" ||
    sectionConfig?.id === "mahi-select";

  const songsQuery = useQuery({
    queryKey: ["section-songs", isMahiSelect ? "mahi-select" : section.id],
    queryFn: async () => {
      if (isMahiSelect) {
        const { data, error } = await supabase
          .from("songs")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          throw new Error(`Could not load songs: ${error.message}`);
        }
        return (data ?? []) as DatabaseSong[];
      }
      return getSongs();
    },
    enabled:
      isMahiSelect ||
      (!sectionConfig && section.id !== "quick-picks") ||
      (sectionConfig?.source === "local" && section.id !== "quick-picks"),
    staleTime: import.meta.env.DEV ? 0 : 1000 * 60 * 5,
    gcTime: import.meta.env.DEV ? 0 : 1000 * 60 * 30,
  });

  const databaseSongs = songsQuery.data ?? [];
  const youtubeSongs = paginatedSongs.length > 0 ? paginatedSongs : (youtubeQuery.data?.songs ?? []);

  const isLoading =
    section.id === "quick-picks"
      ? quickPicksQuery.isLoading && paginatedSongs.length === 0
      : sectionConfig?.source === "youtube"
        ? youtubeQuery.isLoading && paginatedSongs.length === 0
        : songsQuery.isLoading && databaseSongs.length === 0;

  const loadError =
    section.id === "quick-picks"
      ? quickPicksQuery.error instanceof Error
        ? quickPicksQuery.error.message
        : ""
      : sectionConfig?.source === "youtube"
        ? youtubeQuery.error instanceof Error
          ? youtubeQuery.error.message
          : ""
        : songsQuery.error instanceof Error
          ? songsQuery.error.message
          : "";

  const [isSectionLiked, setIsSectionLiked] = useState(false);
  const [showHeroMoreMenu, setShowHeroMoreMenu] = useState(false);
  const [showSectionInfoModal, setShowSectionInfoModal] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [infoModalSong, setInfoModalSong] = useState<PlayerSong | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Load section favorite status from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(FAVORITE_SECTIONS_KEY);
      if (saved) {
        const list: string[] = JSON.parse(saved);
        setIsSectionLiked(list.includes(section.id));
      }
    } catch (e) {
      console.error(e);
    }
  }, [section.id]);

  const toggleSectionFavorite = () => {
    try {
      const saved = localStorage.getItem(FAVORITE_SECTIONS_KEY);
      let list: string[] = saved ? JSON.parse(saved) : [];
      const nextState = !isSectionLiked;
      if (nextState) {
        if (!list.includes(section.id)) list.push(section.id);
      } else {
        list = list.filter((id) => id !== section.id);
      }
      localStorage.setItem(FAVORITE_SECTIONS_KEY, JSON.stringify(list));
      setIsSectionLiked(nextState);
    } catch (e) {
      console.error(e);
    }
  };

  // Realtime channel listener -> invalidates queries safely
  useEffect(() => {
    return subscribeToRealtimeChanges(`section-details-${section.id}`, [
      {
        table: "songs",
        callback: () => {
          void queryClient.invalidateQueries({ queryKey: ["section-songs"] });
          void queryClient.invalidateQueries({ queryKey: ["homepage-songs"] });
        },
      },
      {
        table: "trending_songs",
        callback: () => void queryClient.invalidateQueries({ queryKey: ["homepage-trending"] }),
      },
    ]);
  }, [section.id, queryClient]);

  const allCatalogueSongs = useMemo<PlayerSong[]>(() => {
    const dbConverted = databaseSongs.map((s) => databaseSongToPlayerSong(s));
    return dbConverted.length > 0 ? dbConverted : runtimeSongs;
  }, [databaseSongs]);

  const rankedPlayedItems = useMemo(() => {
    if (section.id !== "recently-played") return [];
    return getRankedPlayedSongs(allCatalogueSongs, player.recent, 100);
  }, [section.id, allCatalogueSongs, player.recent, player.current?.id]);

  const playCountsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of rankedPlayedItems) {
      map.set(item.song.id, item.count);
    }
    return map;
  }, [rankedPlayedItems]);

  const songs = useMemo<PlayerSong[]>(() => {
    const sectionId = section.id;

    if (isMahiSelect) {
      return databaseSongs.map((song) => databaseSongToPlayerSong(song));
    }

    if (sectionId === "quick-picks") {
      if (paginatedSongs.length > 0) return paginatedSongs;
      return quickPicksQuery.data ?? [];
    }

    if (sectionId === "recently-played") {
      return rankedPlayedItems.map((item) => item.song);
    }

    if (sectionConfig?.source === "youtube") {
      if (youtubeSongs.length > 0) return youtubeSongs;
      // Fallback to runtime songs if already loaded
      const runtimeSectionSongs = runtimeSongs.filter((s) => belongsToSection(s, sectionId as SectionId));
      if (runtimeSectionSongs.length > 0) return runtimeSectionSongs;
    }

    return databaseSongs
      .map((song) => databaseSongToPlayerSong(song))
      .filter((song) => belongsToSection(song, sectionId as SectionId));
  }, [
    isMahiSelect,
    section.id,
    sectionConfig,
    rankedPlayedItems,
    youtubeSongs,
    databaseSongs,
    paginatedSongs,
    quickPicksQuery.data,
  ]);

  const queueSource = useMemo(
    () => ({
      type:
        section.id === "quick-picks"
          ? ("favourite" as const)
          : section.id === "trending"
            ? ("trending" as const)
            : section.id === "recently-played"
              ? ("recent" as const)
              : ("section" as const),
      id: isMahiSelect ? "mahi-select" : section.id,
      title: isMahiSelect ? "Mahi Select" : section.title,
    }),
    [isMahiSelect, section.id, section.title],
  );

  const navigationSource = useMemo(
    () => ({
      ...queueSource,
      pathname: `/section/${section.slug}`,
      label: isMahiSelect ? "Mahi Select" : section.title,
    }),
    [queueSource, section.slug, section.title, isMahiSelect],
  );

  const totalDuration = sumDuration(songs);
  const hasSongs = songs.length > 0;
  const heroCover = songs[0]?.cover ?? null;

  const trendingIds = useMemo<Set<string>>(
    () => new Set(songs.filter((s) => s.trending).map((s) => s.id)),
    [songs],
  );

  const featuredSongs = useMemo(() => {
    if (section.id === "recently-played" || section.id === "quick-picks") return [];
    return getFeaturedSongsForSection(section.id, songs, allCatalogueSongs, trendingIds, 5);
  }, [section.id, songs, allCatalogueSongs, trendingIds]);

  const mostPlayedSongs = useMemo<PlayerSong[]>(() => {
    if (section.id !== "recently-played") return [];
    return songs.slice(0, 6);
  }, [section.id, songs]);

  const categoryLabel =
    section.id === "quick-picks"
      ? "PERSONALIZED MIX"
      : section.id === "trending"
        ? "TRENDING"
        : section.id === "recently-played"
          ? "RECENT LISTENING"
          : isMahiSelect
            ? "MAHI SELECT"
            : "COLLECTION";

  const isCurrentPlaying = player.queueSource?.id === queueSource.id && player.current !== null;

  const isShuffleActive = isCurrentPlaying && player.shuffle;

  const handlePlayAll = () => {
    if (hasSongs) {
      player.playFromCollection(
        songs,
        0,
        queueSource,
        navigationSource,
        isMahiSelect ? "mahi_select" : undefined,
      );
    }
  };

  const handleShuffle = () => {
    if (!hasSongs) return;
    if (isCurrentPlaying) {
      player.toggleShuffle();
    } else {
      const shuffled = shuffleArray(songs);
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

  const handleShareCollection = async () => {
    await shareContent({
      title: `${section.title} — MEVO`,
      text: section.subtitle,
      url: window.location.href,
    });
  };

  const handleShareTrack = async (song: PlayerSong) => {
    await shareContent({
      title: `${song.title} — ${song.artist}`,
      text: `Listen to ${song.title} by ${song.artist} on MEVO`,
      url: `${window.location.origin}/song/${song.id}`,
    });
  };

  const handlePlayCard = (e: React.MouseEvent, song: PlayerSong, playlist: PlayerSong[]) => {
    e.preventDefault();
    e.stopPropagation();

    const isCurrent = player.current?.id === song.id;
    if (isCurrent) {
      player.toggle();
      return;
    }

    // Try finding in full songs array first to maintain full queue context
    const songIndexInAll = songs.findIndex((s) => s.id === song.id);
    if (songIndexInAll !== -1) {
      player.playFromCollection(
        songs,
        songIndexInAll,
        queueSource,
        navigationSource,
        isMahiSelect ? "mahi_select" : undefined,
      );
      return;
    }

    // Otherwise play from the playlist
    const songIndexInList = playlist.findIndex((s) => s.id === song.id);
    if (songIndexInList !== -1) {
      player.playFromCollection(
        playlist,
        songIndexInList,
        queueSource,
        navigationSource,
        isMahiSelect ? "mahi_select" : undefined,
      );
    } else {
      player.playFromCollection(
        [song, ...playlist],
        0,
        queueSource,
        navigationSource,
        isMahiSelect ? "mahi_select" : undefined,
      );
    }
  };

  return (
    <div className="relative min-h-screen text-foreground pb-4 sm:pb-6">
      {/* 1. FULL-WIDTH ENLARGED BLURRED COVER HERO BACKGROUND */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 inset-x-0 h-[420px] sm:h-[460px] overflow-hidden z-0"
      >
        {heroCover && (
          <div
            className="absolute -inset-10 bg-cover bg-center opacity-35 dark:opacity-60 scale-105 blur-sm sm:blur-[28px] transform-gpu transition-opacity duration-300"
            style={{ backgroundImage: `url(${heroCover})` }}
          />
        )}

        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom, color-mix(in oklab, var(--background) 25%, transparent) 0%, color-mix(in oklab, var(--background) 70%, transparent) 55%, var(--background) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, color-mix(in oklab, var(--background) 80%, transparent) 0%, transparent 50%, color-mix(in oklab, var(--background) 60%, transparent) 100%)",
          }}
        />
      </div>

      {/* Content Container */}
      <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 md:px-12 pt-3 sm:pt-4">
        {/* Single Top Control Row: Back (Left) and Search (Far Right) */}
        <div className="relative z-20 flex items-center justify-between mb-3">
          <AppBackButton fallbackTo="/" className="mb-0" />

          {/* Search Button at Far Right */}
          {searchOpen ? (
            <div className="relative flex items-center">
              <LiveSearch variant="compact" />
              <button
                type="button"
                aria-label="Close search"
                onClick={() => setSearchOpen(false)}
                className="ml-1.5 grid size-8 shrink-0 place-items-center rounded-full bg-white/80 dark:bg-white/[0.08] text-slate-800 dark:text-white/90 border border-slate-200/80 dark:border-white/10 backdrop-blur-md shadow-sm dark:shadow-lg transition-all hover:bg-slate-100 dark:hover:bg-white/15 focus:outline-none"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              aria-label="Search"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 rounded-full bg-white/80 dark:bg-white/[0.08] px-3.5 py-1.5 text-xs font-extrabold text-slate-800 dark:text-white/90 border border-slate-200/80 dark:border-white/10 backdrop-blur-md shadow-sm dark:shadow-lg transition-all hover:bg-slate-100 dark:hover:bg-white/15 focus:outline-none"
            >
              <Search className="size-3.5 text-teal-600 dark:text-teal-400" />
              <span className="hidden sm:inline">Search...</span>
            </button>
          )}
        </div>

        {/* 2. HERO CONTENT LAYOUT */}
        <section aria-label="Section Header">
          <div className="flex items-start gap-4 sm:gap-6">
            {/* Section Cover Artwork — gently scales and fades in */}
            <motion.div
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.26, delay: 0.04, ease: [0.22, 1, 0.36, 1] }}
              className="relative size-32 sm:size-40 shrink-0 overflow-hidden rounded-2xl border border-border shadow-[0_12px_28px_rgba(0,0,0,0.15)] dark:shadow-[0_12px_28px_rgba(0,0,0,0.6)]"
            >
              {heroCover ? (
                <SongCoverImage
                  src={heroCover}
                  alt={`${section.title} cover`}
                  width={600}
                  height={600}
                  loading="eager"
                  decoding="auto"
                  className="size-full object-cover"
                />
              ) : (
                <div className="grid size-full place-items-center bg-card text-teal-400">
                  <Music2 className="size-10" />
                </div>
              )}
            </motion.div>

            {/* Information Block — appears first in sequence */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, delay: 0.02, ease: [0.22, 1, 0.36, 1] }}
              className="min-w-0 flex-1 pt-1"
            >
              <p className="text-[10px] sm:text-xs font-extrabold uppercase tracking-[0.2em] text-teal-400">
                {categoryLabel}
              </p>
              <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mt-0.5 truncate">
                {section.title}
              </h1>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{section.subtitle}</p>

              <div className="mt-2 flex items-center gap-3 text-xs font-medium text-muted-foreground">
                <span>{songs.length} tracks</span>
                <span>•</span>
                <span>{formatTime(totalDuration)}</span>
              </div>
            </motion.div>
          </div>

          {/* 3. HERO ACTION CONTROLS — appear next */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 flex items-center justify-between"
          >
            {/* Play All Button */}
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={handlePlayAll}
              disabled={!hasSongs}
              className="flex items-center gap-2 rounded-full bg-[#4FD1C5] px-5 sm:px-6 py-2.5 sm:py-3 text-xs sm:text-sm font-extrabold text-[#071012] shadow-[0_0_20px_rgba(79,209,197,0.4)] transition-all hover:bg-[#4FD1C5]/90 disabled:opacity-50"
            >
              <Play className="size-4 fill-current translate-x-0.5" />
              Play All
            </motion.button>

            {/* Secondary Buttons with Labels Underneath */}
            <div className="flex items-center gap-4 sm:gap-6">
              {/* Shuffle */}
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={handleShuffle}
                  disabled={!hasSongs}
                  aria-label={isShuffleActive ? "Shuffle is on" : "Shuffle is off"}
                  title={isShuffleActive ? "Shuffle On" : "Shuffle Off"}
                  className={cn(
                    "grid size-11 place-items-center rounded-full border transition-all duration-200 cursor-pointer disabled:opacity-50",
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
                </button>
                <span
                  className={cn(
                    "text-[10px] font-medium transition-colors",
                    isShuffleActive ? "text-[#4FD1C5]" : "text-white/60",
                  )}
                >
                  Shuffle
                </span>
              </div>

              {/* Favorite */}
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={toggleSectionFavorite}
                  aria-label="Favorite section"
                  className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                >
                  <Heart
                    className={cn(
                      "size-4 transition-colors",
                      isSectionLiked ? "fill-teal-400 text-teal-400" : "text-white/80",
                    )}
                  />
                </button>
                <span className="text-[10px] text-white/60 font-medium">Favorite</span>
              </div>

              {/* Hero More Menu Button */}
              <div className="relative flex flex-col items-center gap-1">
                <button
                  type="button"
                  aria-label="More options"
                  onClick={() => setShowHeroMoreMenu((o) => !o)}
                  className="grid size-11 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-white/80 transition-colors hover:bg-white/15 hover:text-white"
                >
                  <EllipsisVertical className="size-4" />
                </button>
                <span className="text-[10px] text-white/60 font-medium">More</span>

                {/* Hero More Options Dropdown */}
                <AnimatePresence>
                  {showHeroMoreMenu && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-14 z-50 min-w-44 rounded-2xl bg-[#182227] border border-[#4FD1C5]/30 p-1.5 shadow-2xl"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          handlePlayAll();
                          setShowHeroMoreMenu(false);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                      >
                        <Play className="size-3.5 text-teal-400" /> Play All
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          handleShuffle();
                          setShowHeroMoreMenu(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors cursor-pointer",
                          isShuffleActive
                            ? "text-teal-400 bg-teal-400/10 hover:bg-teal-400/15"
                            : "text-white hover:bg-white/10",
                        )}
                      >
                        <Shuffle className="size-3.5 text-teal-400" /> Shuffle
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          toggleSectionFavorite();
                          setShowHeroMoreMenu(false);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                      >
                        <Heart
                          className={cn(
                            "size-3.5",
                            isSectionLiked ? "fill-teal-400 text-teal-400" : "text-teal-400",
                          )}
                        />
                        {isSectionLiked ? "Remove Favorite" : "Favorite Section"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleShareCollection();
                          setShowHeroMoreMenu(false);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                      >
                        <Share2 className="size-3.5 text-teal-400" /> Share Collection
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSectionInfoModal(true);
                          setShowHeroMoreMenu(false);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                      >
                        <Info className="size-3.5 text-teal-400" /> Collection Info
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Loading Indicator */}
        {isLoading && (
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-white/60">
            <LoaderCircle className="size-4 animate-spin text-emerald-400" />
            Loading collection tracks...
          </div>
        )}

        {/* Load Error */}
        {loadError && (
          <p className="mt-6 text-sm text-red-400" role="alert">
            {loadError}
          </p>
        )}

        {!isLoading && (
          <>
            {/* 4. MOST PLAYED (For Resume Listening) / FEATURED SECTION (For Collections) */}
            {section.id === "recently-played"
              ? mostPlayedSongs.length > 0 && (
                  <section className="mt-8 space-y-3" aria-label="Most Played Songs">
                    <div className="flex items-center justify-between">
                      <h2 className="text-base sm:text-lg font-bold text-white">Most Played</h2>
                      <span className="text-xs font-medium text-teal-400">Top 6 Tracks</span>
                    </div>

                    <div className="carousel-track no-scrollbar flex items-center gap-3 overflow-x-auto py-1">
                      {mostPlayedSongs.map((song, index) => {
                        const isCurrent = player.current?.id === song.id;
                        const isPlaying = isCurrent && player.isPlaying;

                        return (
                          <motion.article
                            key={`most-played-${song.id}`}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => {
                              recordPlayerSource();
                              void navigate({ to: "/song/$songId", params: { songId: song.id } });
                            }}
                            className={cn(
                              "carousel-item group relative w-[155px] sm:w-[170px] shrink-0 rounded-2xl border p-2.5 shadow-md cursor-pointer transition-all duration-200",
                              isCurrent
                                ? "bg-[#182227] border-[#4FD1C5]/50"
                                : "bg-[#12191D]/90 border-white/[0.08] hover:border-white/[0.16]",
                            )}
                          >
                            <div className="relative aspect-square w-full overflow-hidden rounded-xl">
                              <SongCoverImage
                                src={song.cover}
                                alt=""
                                width={400}
                                height={400}
                                loading="eager"
                                decoding="auto"
                                className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                              {/* Rank badge 1-6 */}
                              <div className="absolute top-2 left-2 flex h-5 px-1.5 items-center justify-center rounded-md bg-[#4FD1C5] text-[10px] font-extrabold text-[#071012] shadow-md">
                                #{index + 1}
                              </div>

                              {/* Play / Pause Toggle Button */}
                              <button
                                type="button"
                                onClick={(e) => handlePlayCard(e, song, mostPlayedSongs)}
                                aria-label={
                                  isPlaying ? `Pause ${song.title}` : `Play ${song.title}`
                                }
                                className={cn(
                                  "absolute bottom-2 right-2 grid size-8 place-items-center rounded-full shadow-md transition-all duration-200 z-10 cursor-pointer",
                                  "bg-[#2ee0b5] text-[#0d1617] shadow-teal-500/25 hover:scale-105 active:scale-95",
                                  isPlaying
                                    ? "shadow-[0_0_14px_rgba(46,224,181,0.6)]"
                                    : "opacity-100 sm:opacity-90 sm:hover:opacity-100",
                                )}
                              >
                                {isPlaying ? (
                                  <Pause className="size-3.5 fill-current" />
                                ) : (
                                  <Play className="size-3.5 translate-x-0.5 fill-current" />
                                )}
                              </button>
                            </div>

                            <h3
                              className={cn(
                                "mt-2 truncate text-xs font-bold transition-colors",
                                isCurrent
                                  ? "text-teal-400"
                                  : "text-foreground group-hover:text-primary",
                              )}
                            >
                              {song.title}
                            </h3>
                            <p className="truncate text-[11px] text-muted-foreground mt-0.5">
                              {song.artist}
                            </p>
                          </motion.article>
                        );
                      })}
                    </div>
                  </section>
                )
              : featuredSongs.length > 0 && (
                  <section className="mt-8 space-y-3" aria-label="Featured Songs">
                    <h2 className="text-base sm:text-lg font-bold text-foreground">
                      Featured in {section.title}
                    </h2>

                    <div className="carousel-track no-scrollbar flex items-center gap-3 overflow-x-auto py-1">
                      {featuredSongs.map((song) => {
                        const isCurrent = player.current?.id === song.id;
                        const isPlaying = isCurrent && player.isPlaying;

                        return (
                          <motion.article
                            key={`featured-${song.id}`}
                            whileTap={{ scale: 0.97 }}
                            onClick={() => {
                              recordPlayerSource();
                              void navigate({ to: "/song/$songId", params: { songId: song.id } });
                            }}
                            className={cn(
                              "carousel-item group relative w-[155px] sm:w-[170px] shrink-0 rounded-2xl border p-2.5 shadow-md cursor-pointer transition-all duration-200",
                              isCurrent
                                ? "bg-[#182227] border-[#4FD1C5]/50"
                                : "bg-[#12191D]/90 border-white/[0.08] hover:border-white/[0.16]",
                            )}
                          >
                            <div className="relative aspect-square w-full overflow-hidden rounded-xl">
                              <SongCoverImage
                                src={song.cover}
                                alt=""
                                width={400}
                                height={400}
                                loading="eager"
                                decoding="auto"
                                className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                              <div className="absolute top-2 left-2 grid size-5 place-items-center rounded-full bg-[#4FD1C5] text-[#071012] shadow-sm">
                                <Music2 className="size-3" />
                              </div>

                              {/* Play / Pause Toggle Button */}
                              <button
                                type="button"
                                onClick={(e) => handlePlayCard(e, song, featuredSongs)}
                                aria-label={
                                  isPlaying ? `Pause ${song.title}` : `Play ${song.title}`
                                }
                                className={cn(
                                  "absolute bottom-2 right-2 grid size-8 place-items-center rounded-full shadow-md transition-all duration-200 z-10 cursor-pointer",
                                  "bg-[#2ee0b5] text-[#0d1617] shadow-teal-500/25 hover:scale-105 active:scale-95",
                                  isPlaying
                                    ? "shadow-[0_0_14px_rgba(46,224,181,0.6)]"
                                    : "opacity-100 sm:opacity-90 sm:hover:opacity-100",
                                )}
                              >
                                {isPlaying ? (
                                  <Pause className="size-3.5 fill-current" />
                                ) : (
                                  <Play className="size-3.5 translate-x-0.5 fill-current" />
                                )}
                              </button>
                            </div>

                            <h3
                              className={cn(
                                "mt-2 truncate text-xs font-bold transition-colors",
                                isCurrent
                                  ? "text-teal-400"
                                  : "text-foreground group-hover:text-primary",
                              )}
                            >
                              {song.title}
                            </h3>
                            <p className="truncate text-[11px] text-muted-foreground mt-0.5">
                              {song.artist}
                            </p>
                          </motion.article>
                        );
                      })}
                    </div>
                  </section>
                )}

            {/* 5. ALL TRACKS LIST */}
            <section className="mt-8 space-y-3" aria-label="All Tracks">
              <div className="flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  {section.id === "recently-played" ? "All Played Tracks" : "All Tracks"}
                </h2>
                <span className="text-xs font-medium text-white/50">
                  {songs.length} {songs.length === 1 ? "track" : "tracks"}
                </span>
              </div>

              {songs.length === 0 ? (
                <div className="rounded-3xl border border-white/10 bg-[#12191D]/90 p-8 text-center space-y-3">
                  <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/[0.05] text-teal-400">
                    <Music2 className="size-6" />
                  </div>
                  <div>
                    <p className="font-bold text-white text-base">
                      {section.id === "recently-played"
                        ? "You haven't played anything yet"
                        : "No songs in this collection yet"}
                    </p>
                    <p className="text-xs text-white/60 mt-1 max-w-sm mx-auto">
                      {section.id === "recently-played"
                        ? "Play songs from any playlist or album, and they will be automatically tracked and ranked here."
                        : "Check back later for new additions to this collection."}
                    </p>
                  </div>
                  {section.id === "recently-played" && (
                    <div className="pt-2">
                      <Link
                        to="/"
                        className="inline-flex items-center gap-2 rounded-full bg-[#4FD1C5] px-5 py-2 text-xs font-bold text-[#071012] shadow-md hover:bg-[#4FD1C5]/90 transition-colors"
                      >
                        Discover Music
                      </Link>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-3xl border border-white/[0.08] bg-[#12191D]/90 p-2 sm:p-3 shadow-xl space-y-1">
                  {songs.map((song, index) => {
                    const isCurrent = player.current?.id === song.id;
                    const isPlaying = isCurrent && player.isPlaying;
                    const menuOpen = openMenuId === song.id;
                    const playCount = playCountsMap.get(song.id);
                    const serialRank = index + 1;
                    const trackNumber = String(serialRank).padStart(2, "0");

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
                            songs,
                            index,
                            queueSource,
                            navigationSource,
                            isMahiSelect ? "mahi_select" : undefined,
                          )
                        }
                      >
                        {/* Left: 2-Digit Serial / Rank + Circular Cover + Title & Artist */}
                        <div className="flex min-w-0 flex-1 items-center gap-3 pr-2">
                          <span className="w-6 shrink-0 text-center font-mono text-sm font-bold text-teal-400">
                            {isPlaying ? (
                              <Equalizer />
                            ) : section.id === "recently-played" ? (
                              `#${serialRank}`
                            ) : (
                              trackNumber
                            )}
                          </span>

                          <div className="relative size-11 shrink-0 overflow-hidden rounded-full border border-white/10">
                            <SongCoverImage
                              src={song.cover}
                              alt=""
                              width={44}
                              height={44}
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

                        {/* Right: Duration + Play button + Options menu */}
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
                                  songs,
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

                          {/* Track Options Dropdown */}
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
                                  className="absolute right-0 top-8 z-50 min-w-44 rounded-2xl bg-[#182227] border border-[#4FD1C5]/30 p-1.5 shadow-2xl"
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
                                  <button
                                    type="button"
                                    onClick={() => {
                                      recordPlayerSource();
                                      void navigate({
                                        to: "/song/$songId",
                                        params: { songId: song.id },
                                      });
                                      setOpenMenuId(null);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                                  >
                                    <Disc3 className="size-3.5 text-teal-400" /> Go to Song
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void navigate({
                                        to: "/artist/$artistSlug",
                                        params: { artistSlug: slugify(song.artist) },
                                      });
                                      setOpenMenuId(null);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                                  >
                                    <User className="size-3.5 text-teal-400" /> Go to Artist
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      void handleShareTrack(song);
                                      setOpenMenuId(null);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                                  >
                                    <Share2 className="size-3.5 text-teal-400" /> Share Track
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInfoModalSong(song);
                                      setOpenMenuId(null);
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-white hover:bg-white/10"
                                  >
                                    <Info className="size-3.5 text-teal-400" /> Song Info
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

              {/* Manual "Load More Songs" Glassmorphic Pagination */}
              {(sectionConfig?.source === "youtube" || section.id === "quick-picks") && (
                <div className="py-10 flex flex-col items-center justify-center">
                  {hasMore ? (
                    <div className="flex flex-col items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void loadMoreTracks();
                        }}
                        disabled={isFetchingMore}
                        className="group relative inline-flex items-center justify-center gap-2.5 px-7 py-3 rounded-full text-xs sm:text-sm font-bold tracking-wide transition-all duration-300 backdrop-blur-xl border border-white/10 dark:border-white/15 bg-white/10 dark:bg-white/[0.07] text-slate-800 dark:text-white shadow-lg hover:shadow-teal-500/20 hover:border-teal-400/40 hover:bg-white/20 dark:hover:bg-white/[0.12] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none cursor-pointer"
                      >
                        {isFetchingMore ? (
                          <>
                            <LoaderCircle className="size-4 animate-spin text-teal-400" />
                            <span>Loading more songs...</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="size-4 text-teal-400 group-hover:translate-y-0.5 transition-transform duration-200" />
                            <span>Load More Songs</span>
                          </>
                        )}
                      </button>
                      <span className="text-[11px] font-medium text-white/40 mt-1">
                        Showing {songs.length} tracks
                      </span>
                    </div>
                  ) : (
                    songs.length > 0 && (
                      <div className="text-center py-2">
                        <p className="text-xs font-medium text-white/40">
                          ✨ All {songs.length} tracks loaded
                        </p>
                      </div>
                    )
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Collection Info Modal */}
      <AnimatePresence>
        {showSectionInfoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSectionInfoModal(false)}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative z-10 w-full max-w-sm rounded-3xl border border-[#4FD1C5]/30 bg-[#182227] p-5 shadow-2xl space-y-3"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Info className="size-4 text-teal-400" /> Collection Information
                </h3>
                <button
                  type="button"
                  onClick={() => setShowSectionInfoModal(false)}
                  className="grid size-7 place-items-center rounded-full text-white/50 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="space-y-2 text-xs">
                <div>
                  <span className="text-white/50">Collection Title:</span>
                  <p className="font-bold text-white mt-0.5">{section.title}</p>
                </div>
                <div>
                  <span className="text-white/50">Description:</span>
                  <p className="text-white/80 mt-0.5">{section.subtitle}</p>
                </div>
                <div>
                  <span className="text-white/50">Tracks Count:</span>
                  <p className="text-white/80 mt-0.5">{songs.length} tracks</p>
                </div>
                <div>
                  <span className="text-white/50">Total Duration:</span>
                  <p className="text-white/80 mt-0.5">{formatTime(totalDuration)}</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Song Info Modal */}
      <AnimatePresence>
        {infoModalSong && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setInfoModalSong(null)}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative z-10 w-full max-w-sm rounded-3xl border border-[#4FD1C5]/30 bg-[#182227] p-5 shadow-2xl space-y-3"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Info className="size-4 text-teal-400" /> Song Information
                </h3>
                <button
                  type="button"
                  onClick={() => setInfoModalSong(null)}
                  className="grid size-7 place-items-center rounded-full text-white/50 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <SongCoverImage
                  src={infoModalSong.cover}
                  alt=""
                  className="size-14 rounded-xl object-cover border border-white/10"
                />
                <div>
                  <h4 className="text-sm font-bold text-white">{infoModalSong.title}</h4>
                  <p className="text-xs text-white/60 mt-0.5">{infoModalSong.artist}</p>
                </div>
              </div>
              <div className="space-y-1.5 text-xs pt-2 border-t border-white/10">
                <div>
                  <span className="text-white/50">Album:</span>
                  <span className="text-white/90 ml-2 font-medium">
                    {infoModalSong.album || "Single"}
                  </span>
                </div>
                <div>
                  <span className="text-white/50">Duration:</span>
                  <span className="text-white/90 ml-2 font-medium">
                    {formatTime(infoModalSong.duration)}
                  </span>
                </div>
                <div>
                  <span className="text-white/50">Genre:</span>
                  <span className="text-white/90 ml-2 font-medium">
                    {infoModalSong.genre || "Pop"}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
