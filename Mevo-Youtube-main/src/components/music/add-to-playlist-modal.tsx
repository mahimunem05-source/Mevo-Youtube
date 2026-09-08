import React, { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, FolderPlus, Music2, Plus, Search, X } from "lucide-react";
import { usePlaylists, getPlaylistDisplayCover } from "@/context/PlaylistContext";
import { SongCoverImage } from "./song-cover-image";
import { cn } from "@/lib/utils";

export function AddToPlaylistModal() {
  const {
    addToPlaylistTrack,
    closeAddToPlaylistModal,
    playlists,
    toggleTrackInPlaylist,
    isTrackInPlaylist,
    openCreatePlaylistModal,
  } = usePlaylists();

  const [searchQuery, setSearchQuery] = useState("");

  if (!addToPlaylistTrack) return null;

  const track = addToPlaylistTrack;

  const filteredPlaylists = playlists.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const handleCreateNew = () => {
    closeAddToPlaylistModal();
    openCreatePlaylistModal(null, track);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeAddToPlaylistModal}
          className="fixed inset-0 bg-black/75 backdrop-blur-md"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 flex w-full max-w-md flex-col rounded-3xl border border-white/10 bg-[#12191D]/95 p-5 sm:p-6 shadow-2xl backdrop-blur-2xl text-white"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div>
              <h2 className="text-lg font-extrabold text-white tracking-tight">Add to Playlist</h2>
              <p className="text-xs text-white/60">Choose a playlist or create a new one</p>
            </div>
            <button
              type="button"
              onClick={closeAddToPlaylistModal}
              className="grid size-8 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
              aria-label="Close modal"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Active Song Banner */}
          <div className="my-4 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2.5">
            <SongCoverImage
              src={track.cover}
              alt=""
              width={48}
              height={48}
              className="size-12 rounded-xl object-cover ring-1 ring-white/10 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{track.title}</p>
              <p className="truncate text-xs font-semibold text-teal-400 mt-0.5">{track.artist}</p>
            </div>
          </div>

          {/* Playlist Search / Filter */}
          {playlists.length > 3 && (
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-white/40" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search playlists..."
                className="w-full rounded-xl border border-white/10 bg-white/5 py-2 pl-9 pr-3 text-xs text-white placeholder-white/40 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
              />
            </div>
          )}

          {/* Playlist List */}
          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1 no-scrollbar my-1">
            {filteredPlaylists.map((playlist) => {
              const inPlaylist = isTrackInPlaylist(playlist.id, track.id);
              const cover = getPlaylistDisplayCover(playlist);

              return (
                <button
                  key={playlist.id}
                  type="button"
                  onClick={() => toggleTrackInPlaylist(playlist.id, track)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-2xl border p-2.5 text-left transition-all cursor-pointer",
                    inPlaylist
                      ? "border-teal-400/40 bg-teal-400/10 text-white"
                      : "border-white/5 bg-white/[0.02] text-white/80 hover:bg-white/[0.07] hover:border-white/15"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {cover ? (
                      <img
                        src={cover}
                        alt=""
                        className="size-10 rounded-xl object-cover ring-1 ring-white/10 shrink-0"
                      />
                    ) : (
                      <div className="grid size-10 place-items-center rounded-xl bg-teal-400/10 text-teal-400 border border-teal-400/20 shrink-0">
                        <Music2 className="size-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-white">{playlist.name}</p>
                      <p className="text-[11px] text-white/50">
                        {playlist.tracks.length} track{playlist.tracks.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "grid size-7 place-items-center rounded-full border transition-all shrink-0",
                      inPlaylist
                        ? "border-teal-400 bg-[#4FD1C5] text-[#071012] shadow-[0_0_10px_rgba(79,209,197,0.4)]"
                        : "border-white/20 bg-transparent text-transparent"
                    )}
                  >
                    <Check className={cn("size-3.5 stroke-[3]", inPlaylist ? "text-[#071012]" : "opacity-0")} />
                  </div>
                </button>
              );
            })}

            {playlists.length === 0 && (
              <div className="py-6 text-center text-xs text-white/50">
                You don't have any playlists yet.
              </div>
            )}
          </div>

          {/* Quick "+ New Playlist" action */}
          <div className="mt-4 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={handleCreateNew}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#4FD1C5] py-2.5 text-xs font-bold text-[#071012] shadow-lg shadow-teal-500/20 transition-transform active:scale-95 hover:bg-[#4FD1C5]/90 cursor-pointer"
            >
              <Plus className="size-4 stroke-[3]" />
              <span>Create New Playlist</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
