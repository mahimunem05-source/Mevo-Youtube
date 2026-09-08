import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  Download,
  Search,
  Play,
  Pause,
  Trash2,
  HardDrive,
  Music2,
  ArrowUpDown,
  EllipsisVertical,
} from "lucide-react";
import { useDownloads } from "@/hooks/useDownloads";
import { usePlayer } from "@/lib/player-context";
import { formatTime, type Song } from "@/data/songs";
import { formatBytes } from "@/services/offlineStorage";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader } from "@/components/music/page-header";
import { SongCoverImage } from "@/components/music/song-cover-image";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/downloads")({
  head: () => ({
    meta: [
      { title: "Downloads — MEVO" },
      { name: "description", content: "Your downloaded music available offline." },
    ],
  }),
  component: DownloadsPage,
});

type SortOption = "recent" | "title" | "artist" | "size";

function DownloadsPage() {
  const player = usePlayer();
  const { downloadedTracks, isLoading, totalStorageFormatted, removeDownload, clearAllDownloads } =
    useDownloads();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("recent");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [songToRemove, setSongToRemove] = useState<Song | null>(null);

  const filteredAndSortedTracks = useMemo(() => {
    let result = [...downloadedTracks];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) => t.song.title.toLowerCase().includes(q) || t.song.artist.toLowerCase().includes(q),
      );
    }

    result.sort((a, b) => {
      if (sortBy === "title") return a.song.title.localeCompare(b.song.title);
      if (sortBy === "artist") return a.song.artist.localeCompare(b.song.artist);
      if (sortBy === "size") return b.fileSize - a.fileSize;
      return b.downloadedAt - a.downloadedAt; // default recent
    });

    return result;
  }, [downloadedTracks, searchQuery, sortBy]);

  const downloadedSongs = useMemo(
    () => filteredAndSortedTracks.map((t) => t.song),
    [filteredAndSortedTracks],
  );

  const queueSource = useMemo(
    () => ({
      type: "recent" as const,
      id: "downloads",
      title: "Downloads",
    }),
    [],
  );

  const navigationSource = useMemo(
    () => ({
      ...queueSource,
      pathname: "/downloads",
      label: "Downloads",
    }),
    [queueSource],
  );

  const handlePlaySong = (index: number) => {
    if (downloadedSongs.length > 0) {
      player.playFromCollection(downloadedSongs, index, queueSource, navigationSource);
    }
  };

  return (
    <div className="pb-36 pt-2 px-4 sm:px-6 md:px-12 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        eyebrow="OFFLINE LIBRARY"
        title="Downloads"
        subtitle="Your music, available offline anytime."
      />

      {/* Stats & Tools Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-3xl border border-white/[0.08] bg-[#12191D]/90 p-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="grid size-11 place-items-center rounded-2xl bg-[#4FD1C5]/20 text-teal-400">
            <HardDrive className="size-5" />
          </div>
          <div>
            <p className="text-xs text-white/60">Offline Storage Used</p>
            <p className="text-base font-bold text-white mt-0.5">
              {totalStorageFormatted} • {downloadedTracks.length}{" "}
              {downloadedTracks.length === 1 ? "song" : "songs"}
            </p>
          </div>
        </div>

        {downloadedTracks.length > 0 && (
          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors"
          >
            <Trash2 className="size-3.5" /> Remove All
          </button>
        )}
      </div>

      {/* Search & Filter Controls */}
      {downloadedTracks.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search downloaded songs..."
              className="w-full rounded-2xl border border-white/10 bg-[#182227]/80 py-2.5 pl-10 pr-4 text-xs text-white placeholder-white/40 focus:border-[#4FD1C5]/50 focus:outline-none"
            />
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="size-3.5 text-white/40" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-2xl border border-white/10 bg-[#182227]/80 px-3 py-2.5 text-xs text-white/80 focus:border-[#4FD1C5]/50 focus:outline-none"
            >
              <option value="recent">Recently Downloaded</option>
              <option value="title">Song Title</option>
              <option value="artist">Artist</option>
              <option value="size">File Size</option>
            </select>
          </div>
        </div>
      )}

      {/* Downloaded Song List */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-white/60">Loading downloaded music...</div>
      ) : downloadedTracks.length === 0 ? (
        /* Empty State */
        <div className="rounded-3xl border border-white/[0.08] bg-[#12191D]/90 p-12 text-center shadow-xl space-y-3">
          <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-[#4FD1C5]/10 text-teal-400">
            <Download className="size-8" />
          </div>
          <h3 className="text-base font-bold text-white">
            Your downloaded music will appear here.
          </h3>
          <p className="mx-auto max-w-sm text-xs text-white/60">
            Tap the download button on any song or collection to listen offline without an internet
            connection.
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-white/[0.08] bg-[#12191D]/90 p-2 sm:p-3 shadow-xl space-y-1">
          {filteredAndSortedTracks.map((item, index) => {
            const song = item.song;
            const isCurrent = player.current?.id === song.id;
            const isPlaying = isCurrent && player.isPlaying;

            return (
              <motion.div
                key={song.id}
                whileTap={{ scale: 0.99 }}
                className={cn(
                  "group relative flex items-center justify-between rounded-2xl p-2 transition-all duration-200 cursor-pointer select-none",
                  isCurrent ? "bg-[#182227] border border-[#4FD1C5]/40" : "hover:bg-white/[0.04]",
                )}
                onClick={() => handlePlaySong(index)}
              >
                {/* Cover & Info */}
                <div className="flex min-w-0 flex-1 items-center gap-3 pr-2">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-xl border border-white/10">
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
                    <h4
                      className={cn(
                        "truncate text-sm font-bold",
                        isCurrent ? "text-teal-400" : "text-white",
                      )}
                    >
                      {song.title}
                    </h4>
                    <p className="truncate text-xs text-white/60 mt-0.5">
                      {song.artist} • {formatBytes(item.fileSize)}
                    </p>
                  </div>
                </div>

                {/* Duration + Actions */}
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
                        handlePlaySong(index);
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

                  <button
                    type="button"
                    aria-label={`Remove download for ${song.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSongToRemove(song);
                    }}
                    className="grid size-8 place-items-center rounded-full text-white/40 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        open={showClearConfirm}
        title="Clear All Downloads?"
        description="Are you sure you want to delete all offline downloaded songs from your device? This cannot be undone."
        confirmText="Clear All"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          void clearAllDownloads();
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />

      <ConfirmDialog
        open={songToRemove !== null}
        title={`Remove Download?`}
        description={`Remove "${songToRemove?.title}" from offline downloads? You can download it again anytime.`}
        confirmText="Remove"
        cancelText="Cancel"
        variant="danger"
        onConfirm={() => {
          if (songToRemove) {
            void removeDownload(songToRemove);
            setSongToRemove(null);
          }
        }}
        onCancel={() => setSongToRemove(null)}
      />
    </div>
  );
}
