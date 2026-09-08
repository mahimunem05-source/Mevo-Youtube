import { useCallback, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, LoaderCircle, Music2, Play, Shuffle } from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import { useTranslation } from "@/hooks/useTranslation";
import { useMusicLibrary } from "@/hooks/useMusicLibrary";
import type { QueueSource, NavigationSource, Song as PlayerSong } from "@/data/songs";
import { shuffleArray } from "@/lib/collection-utils";
import { SongList } from "@/components/music/song-list";
import { PageHeader } from "@/components/music/page-header";
import { fetchPaginatedYouTubeCategoryTracks } from "@/services/youtube";

export const Route = createFileRoute("/all-songs")({
  head: () => ({
    meta: [
      { title: "All Songs — MEVO" },
      {
        name: "description",
        content: "Browse and stream all available songs in the MEVO music library.",
      },
      { property: "og:title", content: "All Songs — MEVO" },
      {
        property: "og:description",
        content: "Browse and stream all available songs in the MEVO music library.",
      },
    ],
  }),
  component: AllSongsPage,
});

const QUEUE_SOURCE: QueueSource = {
  type: "section",
  id: "all-songs",
  title: "All Songs",
};

const NAV_SOURCE: NavigationSource = {
  type: "section",
  id: "all-songs",
  title: "All Songs",
  pathname: "/all-songs",
  label: "All Songs",
};

function AllSongsPage() {
  const player = usePlayer();
  const { t } = useTranslation();
  const { allSongs, isLoading, error: loadError } = useMusicLibrary();

  const [dynamicSongs, setDynamicSongs] = useState<PlayerSong[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const isFetchingRef = useRef(false);
  const nextPageTokenRef = useRef(nextPageToken);
  nextPageTokenRef.current = nextPageToken;

  // Combine initial catalogue with dynamically fetched tracks (deduplicated)
  const displaySongs = useMemo(() => {
    const seen = new Set<string>();
    const result: PlayerSong[] = [];
    for (const song of allSongs) {
      if (!seen.has(song.id)) {
        seen.add(song.id);
        result.push(song);
      }
    }
    for (const song of dynamicSongs) {
      if (!seen.has(song.id)) {
        seen.add(song.id);
        result.push(song);
      }
    }
    return result;
  }, [allSongs, dynamicSongs]);

  const loadMoreSongs = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setIsFetchingMore(true);

    try {
      const currentToken = nextPageTokenRef.current;
      const res = await fetchPaginatedYouTubeCategoryTracks(
        "top trending global hits english hindi bangla official audio",
        "viewCount",
        20,
        currentToken,
        "global",
        "All Songs"
      );

      if (res.songs.length > 0) {
        setDynamicSongs((prev) => {
          const existingIds = new Set([...allSongs.map((s) => s.id), ...prev.map((s) => s.id)]);
          const newSongs = res.songs.filter((s) => !existingIds.has(s.id));
          return [...prev, ...newSongs];
        });

        // If currently streaming from All Songs queue, smoothly append new tracks to player queue
        if (player.queueSource?.id === QUEUE_SOURCE.id) {
          for (const newSong of res.songs) {
            player.addToQueue(newSong);
          }
        }

        setNextPageToken(res.nextPageToken || null);
        setHasMore(Boolean(res.nextPageToken && res.songs.length > 0));
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.warn("All songs load more error:", err);
      setHasMore(false);
    } finally {
      isFetchingRef.current = false;
      setIsFetchingMore(false);
    }
  }, [allSongs, player]);

  const isCurrentPlaying = player.queueSource?.id === QUEUE_SOURCE.id && player.current !== null;
  const isShuffleActive = isCurrentPlaying && player.shuffle;

  const handlePlayAll = () => {
    if (displaySongs.length > 0) {
      player.playFromCollection(displaySongs, 0, QUEUE_SOURCE, NAV_SOURCE);
    }
  };

  const handleShuffle = () => {
    if (displaySongs.length === 0) return;
    if (isCurrentPlaying) {
      player.toggleShuffle();
    } else {
      const shuffled = shuffleArray(displaySongs);
      player.playFromCollection(shuffled, 0, QUEUE_SOURCE, NAV_SOURCE);
      if (!player.shuffle) {
        player.toggleShuffle();
      }
    }
  };

  return (
    <div className="pb-36 pt-2">
      {/* Header with Title & Action Controls */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-12">
        <PageHeader
          eyebrow={t("nav.library", "Library")}
          title={t("nav.allSongs", "All Songs")}
          subtitle={`${displaySongs.length} tracks available in your library`}
        />

        {/* Global Action Bar */}
        {displaySongs.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePlayAll}
                className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 sm:text-sm cursor-pointer"
              >
                <Play className="size-4 fill-current" />
                Play All
              </button>

              <button
                type="button"
                onClick={handleShuffle}
                className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-medium transition-all sm:text-sm cursor-pointer ${
                  isShuffleActive
                    ? "border-primary bg-primary/20 text-primary shadow-sm"
                    : "border-white/10 bg-card/60 text-muted-foreground hover:border-white/20 hover:text-foreground"
                }`}
              >
                <Shuffle className="size-4" />
                Shuffle
              </button>
            </div>

            <div className="text-xs text-muted-foreground">
              <span className="font-mono text-foreground font-semibold">{displaySongs.length}</span>{" "}
              {displaySongs.length === 1 ? "track" : "tracks"} synced
            </div>
          </div>
        )}

        {/* Loading Spinner */}
        {isLoading && displaySongs.length === 0 && (
          <div className="flex items-center justify-center gap-3 rounded-2xl glass p-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin text-primary" />
            Loading music catalogue...
          </div>
        )}

        {/* Error Notice */}
        {loadError && displaySongs.length === 0 && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs font-semibold text-destructive">
            {loadError}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && displaySongs.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-3xl glass py-16 text-center">
            <div className="mb-4 grid size-16 place-items-center rounded-full bg-white/5 text-muted-foreground">
              <Music2 className="size-8" />
            </div>
            <h3 className="text-base font-semibold text-foreground">No songs found</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              Stream songs from the homepage or search to populate your live library.
            </p>
          </div>
        )}

        {/* Song List Component */}
        {displaySongs.length > 0 && (
          <SongList
            songs={displaySongs}
            queueSource={QUEUE_SOURCE}
            navigationSource={NAV_SOURCE}
            showIndex={true}
            emptyMessage="No songs in this library."
          />
        )}

        {/* Dynamic Continuous Pagination Button */}
        {displaySongs.length > 0 && (
          <div className="py-10 flex flex-col items-center justify-center">
            {hasMore ? (
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void loadMoreSongs();
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
                  Showing {displaySongs.length} tracks
                </span>
              </div>
            ) : (
              <div className="text-center py-2">
                <p className="text-xs font-medium text-white/40">
                  ✨ All {displaySongs.length} tracks loaded
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
