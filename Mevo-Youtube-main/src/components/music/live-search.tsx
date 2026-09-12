import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Clock, LoaderCircle, Search, X, Plus, Play, Check, Music4, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { formatTime, searchSongs as searchStaticSongs, type Song } from "@/data/songs";
import { searchSongs as searchDatabaseSongs } from "@/services/songService";
import { databaseSongToPlayerSong, mergePlayerSongs } from "@/lib/song-adapter";
import { usePlayer } from "@/lib/player-context";
import { useNavigationHistory } from "@/lib/navigation-history";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { SongCoverImage } from "@/components/music/song-cover-image";
import { searchYouTube, searchYouTubePaginated, type YouTubeSearchResult } from "@/services/youtube";
import {
  detectTrackCategory,
  youTubeResultToSong,
} from "@/lib/category-matcher";
import {
  prependToUserQuickPicks,
  cleanLegacyPrependedSections,
  recordSearchInteraction,
} from "@/lib/user-taste";
import { setCachedCatalogue, getCachedCatalogue } from "@/lib/music-library";

const RECENT_SEARCHES_KEY = "mevo_recent_searches";
const LEGACY_RECENT_SEARCHES_KEY = "recent_searches";
const MAX_RECENT_SEARCHES = 8;

const DEFAULT_SUGGESTIONS = [
  "Arijit Singh",
  "Anupam Roy",
  "Coke Studio Bangla",
  "Soft Hindi Vibes",
  "Lofi Chill",
  "Bangla Beats",
];

function getStoredRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw =
      localStorage.getItem(RECENT_SEARCHES_KEY) ||
      localStorage.getItem(LEGACY_RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredRecentSearch(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed || typeof window === "undefined") return getStoredRecentSearches();
  try {
    const existing = getStoredRecentSearches();
    const updated = [
      trimmed,
      ...existing.filter((item) => item.toLowerCase() !== trimmed.toLowerCase()),
    ].slice(0, MAX_RECENT_SEARCHES);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    localStorage.setItem(LEGACY_RECENT_SEARCHES_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error("Could not save recent search:", e);
    return getStoredRecentSearches();
  }
}

function deleteStoredRecentSearch(query: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const existing = getStoredRecentSearches();
    const updated = existing.filter((item) => item.toLowerCase() !== query.toLowerCase());
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    localStorage.setItem(LEGACY_RECENT_SEARCHES_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

function clearAllStoredRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    localStorage.removeItem(RECENT_SEARCHES_KEY);
    localStorage.removeItem(LEGACY_RECENT_SEARCHES_KEY);
  } catch {
    /* ignore */
  }
  return [];
}

interface LiveSearchProps {
  variant?: "hero" | "navbar" | "compact";
  autoFocus?: boolean;
  onClose?: () => void;
}

/**
 * Live search dropdown with robust 300ms debounce, parallel local + YouTube search,
 * instant full-row playback, and persistent auto-category prepend.
 */
export function LiveSearch({
  variant = "hero",
  autoFocus = false,
  onClose,
}: LiveSearchProps) {
  const navbar = variant === "navbar";
  const compact = variant === "compact";
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<Song[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [ytResults, setYtResults] = useState<YouTubeSearchResult[]>([]);
  const [ytNextPageToken, setYtNextPageToken] = useState<string | null>(null);
  const [isSearchingYouTube, setIsSearchingYouTube] = useState(false);
  const [isFetchingMoreYt, setIsFetchingMoreYt] = useState(false);
  const [hasMoreYt, setHasMoreYt] = useState(true);
  const [addedYtIds, setAddedYtIds] = useState<Set<string>>(new Set());
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { play } = usePlayer();
  const { t } = useTranslation();
  const { recordPlayerSource } = useNavigationHistory();

  // Load recent searches & purge any legacy misplaced section prepends on mount
  useEffect(() => {
    setRecentSearches(getStoredRecentSearches());
    cleanLegacyPrependedSections();
  }, []);

  // Instant single-click focus & activation when autoFocus is passed
  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      setRecentSearches(getStoredRecentSearches());
      setOpen(true);
    }
  }, [autoFocus]);

  // In-memory client cache for fast tab-back search results
  const searchCacheMap = useRef(new Map<string, { local: Song[]; yt: YouTubeSearchResult[]; ytToken?: string | null; timestamp: number }>());

  // 450ms Parallel Search Effect (Local DB + YouTube) with query normalization and caching
  useEffect(() => {
    const normalizedQuery = query.trim().replace(/\s+/g, " ");

    if (normalizedQuery.length < 2) {
      setResults([]);
      setYtResults([]);
      setActive(0);
      setIsSearching(false);
      setIsSearchingYouTube(false);
      setIsFetchingMoreYt(false);
      setHasMoreYt(true);
      return;
    }

    // Check fast in-memory cache first
    const cacheKey = normalizedQuery.toLowerCase();
    const cached = searchCacheMap.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      setResults(cached.local);
      setYtResults(cached.yt);
      setYtNextPageToken(cached.ytToken || null);
      setActive(0);
      setIsSearching(false);
      setIsSearchingYouTube(false);
      setIsFetchingMoreYt(false);
      setHasMoreYt(Boolean(cached.ytToken) || cached.yt.length >= 6);
      return;
    }

    let cancelled = false;
    setIsSearching(true);
    setIsSearchingYouTube(true);
    setIsFetchingMoreYt(false);
    setHasMoreYt(true);

    const timerId = window.setTimeout(() => {
      void (async () => {
        try {
          // Parallel execution of Local DB & YouTube searches
          const [dbRes, staticRes, ytRes] = await Promise.allSettled([
            searchDatabaseSongs(normalizedQuery, 6).catch((err) => {
              console.error("Local database search error:", err);
              return [];
            }),
            Promise.resolve(searchStaticSongs(normalizedQuery, 6)),
            searchYouTubePaginated(normalizedQuery, 8, null, "search").catch((err) => {
              console.error("YouTube Search Failed:", err);
              return { items: [], nextPageToken: null, count: 0 };
            }),
          ]);

          if (cancelled) return;

          const dbSongs = dbRes.status === "fulfilled" ? dbRes.value : [];
          const uploadedSongs = dbSongs.map((song) => databaseSongToPlayerSong(song));
          const demoSongs = staticRes.status === "fulfilled" ? staticRes.value : [];
          const mergedLocal = mergePlayerSongs(uploadedSongs, demoSongs).slice(0, 6);

          const youtubeData =
            ytRes.status === "fulfilled" && ytRes.value
              ? ytRes.value
              : { items: [], nextPageToken: null, count: 0 };
          const youtubeMatches = Array.isArray(youtubeData.items) ? youtubeData.items : [];
          const nextToken = youtubeData.nextPageToken || null;

          searchCacheMap.current.set(cacheKey, {
            local: mergedLocal,
            yt: youtubeMatches,
            ytToken: nextToken,
            timestamp: Date.now(),
          });

          setResults(mergedLocal);
          setYtResults(youtubeMatches);
          setYtNextPageToken(nextToken);
          setHasMoreYt(Boolean(nextToken) || youtubeMatches.length >= 6);
          setActive(0);
        } catch (error) {
          if (!cancelled) {
            console.error("Live search execution error:", error);
          }
        } finally {
          if (!cancelled) {
            setIsSearching(false);
            setIsSearchingYouTube(false);
          }
        }
      })();
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [query]);

  // Click outside to close dropdown
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Keyboard shortcut '/' to focus
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement !== inputRef.current) {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Action: Select & Instant Play local song
   */
  const select = (song: Song) => {
    const savedTerm = query.trim() || song.title;
    if (savedTerm) {
      setRecentSearches(saveStoredRecentSearch(savedTerm));
      recordSearchInteraction(savedTerm, song);
    }
    play(song);
    setOpen(false);
    setQuery("");
    recordPlayerSource("/search");
  };

  /**
   * Action: Play YouTube Result immediately in the global audio player
   */
  const handlePlayYouTube = (video: YouTubeSearchResult) => {
    const savedTerm = query.trim() || video.title;
    if (savedTerm) {
      setRecentSearches(saveStoredRecentSearch(savedTerm));
    }
    const song = youTubeResultToSong(video);
    if (savedTerm) {
      recordSearchInteraction(savedTerm, song);
    }
    play(song);
    recordPlayerSource("/search");
    setOpen(false);
    setQuery("");
  };

  /**
   * Action: "+ Add" Button
   * Exclusively prepends track to index 0 of the user's personal Quick Picks section.
   */
  const handleAddToQuickPicks = (video: YouTubeSearchResult) => {
    const song = youTubeResultToSong(video);

    // 1. Prepend directly into user's Quick Picks in localStorage and emit SECTION_PREPENDED event
    prependToUserQuickPicks(song);

    // 2. Prepend directly into all React Query homepage Quick Picks caches immediately
    queryClient.setQueriesData<Song[]>(
      { queryKey: ["homepage-quick-picks"], exact: false },
      (oldData) => {
        if (!oldData) return [song];
        const filtered = oldData.filter((s) => s.id !== song.id);
        return [song, ...filtered];
      },
    );

    // 3. Prepend to cached catalogue
    const currentCatalogue = getCachedCatalogue().filter((s) => s.id !== song.id);
    setCachedCatalogue([song, ...currentCatalogue]);

    // 4. Invalidate Quick Picks & Library queries so UI synchronizes across components
    void queryClient.invalidateQueries({
      queryKey: ["homepage-quick-picks"],
      exact: false,
    });
    void queryClient.invalidateQueries({
      queryKey: ["unified-music-library"],
      exact: false,
    });

    // 5. Save recent search query
    const savedTerm = query.trim() || video.title;
    if (savedTerm) {
      setRecentSearches(saveStoredRecentSearch(savedTerm));
      recordSearchInteraction(savedTerm, song);
    }

    // 6. Update UI state & close search dropdown
    setAddedYtIds((prev) => new Set(prev).add(video.id));
    setOpen(false);
    setQuery("");
    toast.success("Added to Quick Picks");
  };

  const handleLoadMoreYouTube = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const normalizedQuery = query.trim();
    if (isFetchingMoreYt || !normalizedQuery) return;

    setIsFetchingMoreYt(true);
    try {
      const pageResult = await searchYouTubePaginated(normalizedQuery, 8, ytNextPageToken, "search");
      if (pageResult.items.length > 0) {
        const existingIds = new Set(ytResults.map((r) => r.id));
        const fresh = pageResult.items.filter((r) => !existingIds.has(r.id));
        if (fresh.length > 0) {
          setYtResults((prev) => [...prev, ...fresh]);
        }
        setYtNextPageToken(pageResult.nextPageToken);
        setHasMoreYt(Boolean(pageResult.nextPageToken));
      } else {
        setHasMoreYt(false);
      }
    } catch (err) {
      console.error("Failed to load more YouTube results:", err);
      setHasMoreYt(false);
    } finally {
      setIsFetchingMoreYt(false);
    }
  };

  const handleRequestSong = (songTitle: string) => {
    setOpen(false);
    const trimmed = songTitle.trim();
    if (trimmed) {
      setRecentSearches(saveStoredRecentSearch(trimmed));
    }
    void navigate({
      to: "/contact",
      search: {
        song: trimmed,
      },
    });
  };

  const handleSelectRecentQuery = (term: string) => {
    setQuery(term);
    setRecentSearches(saveStoredRecentSearch(term));
    setOpen(true);
    inputRef.current?.focus();
  };

  const totalSelectable = results.length + ytResults.length;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      onClose?.();
      return;
    }

    if (event.key === "Enter") {
      if (totalSelectable > 0) {
        event.preventDefault();
        if (active < results.length && results[active]) {
          select(results[active]);
          return;
        }
        const ytIndex = active - results.length;
        if (ytResults[ytIndex]) {
          handlePlayYouTube(ytResults[ytIndex]);
          return;
        }
      }
      if (query.trim()) {
        event.preventDefault();
        handleRequestSong(query.trim());
        return;
      }
    }

    if (totalSelectable === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % totalSelectable);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index - 1 + totalSelectable) % totalSelectable);
    }
  };

  const showSearchResults = open && query.trim().length > 0;
  const showRecentSearches = open && query.trim().length === 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative",
        compact ? "w-28 xs:w-36 sm:w-48" : "w-full",
        !compact && (navbar ? "max-w-md" : "max-w-xl"),
      )}
    >
      <div
        onClick={() => {
          inputRef.current?.focus();
          setRecentSearches(getStoredRecentSearches());
          setOpen(true);
        }}
        className={cn(
          "search-glass flex items-center rounded-full glass transition-shadow focus-within:glow-ring cursor-text",
          compact ? "gap-2 px-4 py-2" : navbar ? "gap-2 px-4 py-2" : "gap-3 px-5 py-4",
        )}
      >
        <Search
          className={cn(
            "shrink-0 text-primary",
            compact ? "size-3.5" : navbar ? "size-4" : "size-5",
          )}
        />
        <input
          id="search-input"
          ref={inputRef}
          value={query}
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={showSearchResults || showRecentSearches}
          aria-controls="search-results"
          aria-label="Search songs, albums or artists"
          placeholder={
            compact
              ? t("nav.search", "Search...")
              : navbar
                ? t("nav.search", "Search music...")
                : t("nav.searchPlaceholder", "Search songs, albums or artists...")
          }
          onClick={() => {
            setRecentSearches(getStoredRecentSearches());
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setRecentSearches(getStoredRecentSearches());
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground",
            compact ? "text-xs" : navbar ? "text-sm" : "text-base",
          )}
        />

        {isSearching || isSearchingYouTube ? (
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        ) : (
          !compact && (
            <kbd className="hidden rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground sm:block">
              /
            </kbd>
          )
        )}
      </div>

      <AnimatePresence>
        {/* 1. RECENT SEARCHES & SUGGESTIONS DROPDOWN (When focused and query empty) */}
        {showRecentSearches && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "z-50 overflow-hidden rounded-2xl sm:rounded-3xl glass-strong p-2.5 shadow-2xl backdrop-blur-2xl bg-[#12191D]/95 border border-white/10",
              compact
                ? "fixed inset-x-4 top-[3.75rem] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-88 sm:max-w-sm"
                : "absolute left-0 right-0 top-[calc(100%+0.75rem)]",
            )}
          >
            {recentSearches.length > 0 ? (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                    {t("search.recentSearches", "Recent Searches")}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setRecentSearches(clearAllStoredRecentSearches());
                    }}
                    className="text-[11px] font-semibold text-white/50 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    {t("search.clearAll", "Clear All")}
                  </button>
                </div>

                {/* Recent Searches Chips */}
                <div className="flex flex-wrap gap-1.5 px-2 py-2.5 border-b border-white/[0.06]">
                  {recentSearches.map((term) => (
                    <div
                      key={`chip-${term}`}
                      onClick={() => handleSelectRecentQuery(term)}
                      className="group inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] hover:bg-teal-500/20 border border-white/10 hover:border-teal-500/40 px-2.5 py-1 text-xs text-white/90 hover:text-white transition-all cursor-pointer"
                    >
                      <Clock className="size-3 text-teal-400/70 group-hover:text-teal-400 shrink-0" />
                      <span className="truncate max-w-[130px] sm:max-w-[180px]">{term}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${term}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRecentSearches(deleteStoredRecentSearch(term));
                        }}
                        className="ml-0.5 -mr-1 p-0.5 rounded-full text-white/40 hover:text-white hover:bg-white/20 transition-colors"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* List Items */}
                <ul className="py-1 space-y-0.5 max-h-48 overflow-y-auto">
                  {recentSearches.map((term) => (
                    <li
                      key={`row-${term}`}
                      className="group flex items-center justify-between rounded-xl px-3 py-1.5 text-xs sm:text-sm text-white/80 hover:bg-white/[0.08] hover:text-white transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => handleSelectRecentQuery(term)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <Clock className="size-3.5 text-white/40 group-hover:text-teal-400 shrink-0 transition-colors" />
                        <span className="truncate">{term}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${term}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setRecentSearches(deleteStoredRecentSearch(term));
                        }}
                        className="ml-2 p-1 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer shrink-0"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <div className="px-3 py-1.5 border-b border-white/10">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-teal-400">
                    {t("search.suggestedSearches", "Suggested Searches")}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 p-2.5">
                  {DEFAULT_SUGGESTIONS.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => handleSelectRecentQuery(term)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.07] hover:bg-teal-500/20 border border-white/10 hover:border-teal-500/40 px-3 py-1.5 text-xs text-white/90 hover:text-white transition-all cursor-pointer"
                    >
                      <Search className="size-3 text-teal-400/70" />
                      <span>{term}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* 2. LIVE SEARCH RESULTS DROPDOWN */}
        {showSearchResults && (
          <motion.ul
            id="search-results"
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "z-50 max-h-[65vh] sm:max-h-[28rem] overflow-y-auto rounded-2xl sm:rounded-3xl glass-strong p-1.5 sm:p-2 shadow-2xl backdrop-blur-2xl bg-[#12191D]/95 border border-white/10 space-y-1",
              compact
                ? "fixed inset-x-4 top-[3.75rem] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.5rem)] sm:w-88 sm:max-w-sm"
                : "absolute left-0 right-0 top-[calc(100%+0.75rem)]",
            )}
          >
            {/* 1. Local Database Results (Full-Row Clickable) */}
            {results.map((song, index) => {
              const isSelected = active === index;
              return (
                <li
                  key={song.id}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => select(song)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    "group flex items-center justify-between gap-3 sm:gap-3.5 rounded-xl sm:rounded-2xl p-2 sm:p-2.5 text-left transition-all duration-150 cursor-pointer",
                    isSelected
                      ? "bg-white/10 text-teal-400"
                      : "text-white/80 hover:bg-white/[0.06] hover:text-white",
                  )}
                >
                  <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                    <div className="relative size-10 sm:size-11 shrink-0 overflow-hidden rounded-lg sm:rounded-xl border border-white/10">
                      <SongCoverImage
                        src={song.cover}
                        alt=""
                        width={44}
                        height={44}
                        loading="eager"
                        decoding="auto"
                        className="size-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-xs sm:text-sm font-semibold transition-colors",
                          isSelected ? "text-teal-400" : "text-white",
                        )}
                      >
                        {song.title}
                      </span>
                      <span className="block truncate text-[11px] sm:text-xs text-white/50 mt-0.5">
                        {song.artist} {song.category ? `· ${song.category}` : ""}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] sm:text-xs tabular-nums text-white/40">
                      {formatTime(song.duration)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        select(song);
                      }}
                      className="grid size-7 sm:size-8 place-items-center rounded-full bg-white/10 hover:bg-teal-400 hover:text-black text-white transition-all cursor-pointer"
                      title="Play track"
                    >
                      <Play className="size-3 fill-current translate-x-0.5" />
                    </button>
                  </div>
                </li>
              );
            })}

            {/* 2. MEVO Global Results Section (Always runs in parallel) */}
            {(isSearchingYouTube || ytResults.length > 0) && (
              <>
                <li className="px-3 py-2 mt-1.5 border-t border-teal-500/20 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-teal-400">
                    <Music4 className="size-3.5 text-teal-400 drop-shadow-[0_0_8px_rgba(45,212,191,0.5)] shrink-0" />
                    MEVO Global Results
                  </span>
                  {isSearchingYouTube && (
                    <span className="flex items-center gap-1.5 text-[11px] text-teal-300/70 font-medium">
                      <LoaderCircle className="size-3 animate-spin text-teal-400" /> Searching MEVO Global...
                    </span>
                  )}
                </li>

                {/* Skeletons when searching and no items yet */}
                {isSearchingYouTube && ytResults.length === 0 && (
                  <div className="space-y-1 px-1 py-1">
                    {[1, 2, 3].map((n) => (
                      <div
                        key={n}
                        className="flex items-center gap-3 rounded-xl p-2 bg-white/[0.03] animate-pulse"
                      >
                        <div className="size-10 rounded-lg bg-white/10 shrink-0" />
                        <div className="flex-1 space-y-1.5 min-w-0">
                          <div className="h-3.5 bg-white/15 rounded-md w-3/4" />
                          <div className="h-2.5 bg-white/10 rounded-md w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {ytResults.map((yt, ytIndex) => {
                  const itemIndex = results.length + ytIndex;
                  const isSelected = active === itemIndex;
                  const matched = detectTrackCategory(yt.title, yt.channel);

                  return (
                    <li
                      key={yt.id}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handlePlayYouTube(yt)}
                      onMouseEnter={() => setActive(itemIndex)}
                      className={cn(
                        "group flex items-center justify-between gap-2.5 rounded-xl sm:rounded-2xl p-2 sm:p-2.5 text-left transition-all duration-150 cursor-pointer",
                        isSelected
                          ? "bg-white/10 text-teal-400"
                          : "text-white/80 hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      <div className="flex items-center gap-3 sm:gap-3.5 min-w-0 flex-1">
                        <div className="relative size-10 sm:size-11 shrink-0 overflow-hidden rounded-lg sm:rounded-xl border border-white/10 bg-black/40">
                          <img
                            src={yt.thumbnail}
                            alt={yt.title}
                            className="size-full object-cover group-hover:scale-105 transition-transform duration-200"
                            loading="lazy"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block truncate text-xs sm:text-sm font-semibold transition-colors",
                              isSelected ? "text-teal-400" : "text-white",
                            )}
                          >
                            {yt.title}
                          </span>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[11px] sm:text-xs text-white/50">
                            <span className="truncate">{yt.channel}</span>
                            <span>•</span>
                            <span className="text-emerald-400/90 font-medium truncate shrink-0">
                              {matched.title}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Play Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayYouTube(yt);
                          }}
                          className="flex items-center gap-1 rounded-lg bg-white/10 hover:bg-white/20 px-2 sm:px-2.5 py-1 sm:py-1.5 text-[11px] font-medium text-white transition-colors cursor-pointer"
                          title="Play now"
                        >
                          <Play className="size-3 fill-current text-white" />
                          <span>Play</span>
                        </button>

                        {/* "+ Add" Button (Adds directly to Quick Picks) */}
                        {addedYtIds.has(yt.id) ? (
                          <span className="flex items-center gap-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 sm:px-2.5 py-1 sm:py-1.5 text-[11px] font-medium">
                            <Check className="size-3" />
                            <span>Added</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddToQuickPicks(yt);
                            }}
                            className="flex items-center gap-1 rounded-lg bg-[#4FD1C5]/20 hover:bg-[#4FD1C5]/30 text-teal-300 border border-[#4FD1C5]/40 px-2 sm:px-2.5 py-1 sm:py-1.5 text-[11px] font-medium transition-all cursor-pointer"
                            title="Add to Quick Picks"
                          >
                            <Plus className="size-3 text-teal-300 stroke-[2.5]" />
                            <span>Add</span>
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}

                {/* Load More YouTube Songs Button */}
                {ytResults.length >= 6 && hasMoreYt && (
                  <li className="px-3 py-2.5 flex justify-center">
                    <button
                      type="button"
                      onClick={handleLoadMoreYouTube}
                      disabled={isFetchingMoreYt}
                      className="group flex items-center justify-center gap-2 rounded-xl border border-white/10 dark:border-white/15 bg-white/10 dark:bg-white/[0.07] px-4 py-2 text-xs font-bold text-white shadow-sm hover:border-teal-400/40 hover:bg-white/20 dark:hover:bg-white/[0.12] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60"
                    >
                      {isFetchingMoreYt ? (
                        <>
                          <LoaderCircle className="size-3.5 animate-spin text-teal-400" />
                          <span>Loading more tracks...</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="size-3.5 text-teal-400 group-hover:translate-y-0.5 transition-transform duration-200" />
                          <span>Load More YouTube Songs</span>
                        </>
                      )}
                    </button>
                  </li>
                )}
              </>
            )}

            {/* Empty State when zero results found on both local and YouTube */}
            {!isSearching &&
              !isSearchingYouTube &&
              results.length === 0 &&
              ytResults.length === 0 && (
                <li className="p-3 sm:p-4 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-xs sm:text-sm text-white/60">
                      No tracks matched <span className="font-semibold text-white">“{query}”</span>.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleRequestSong(query)}
                      className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl sm:rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 p-2.5 sm:p-3 text-xs sm:text-sm font-medium text-white/80 hover:text-white transition-all cursor-pointer"
                    >
                      <Plus className="size-4 shrink-0 text-teal-400" />
                      <span>Request this song or report an issue</span>
                    </button>
                  </div>
                </li>
              )}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
