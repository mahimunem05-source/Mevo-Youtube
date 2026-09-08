import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ImagePlus, Music2, Sparkles, X } from "lucide-react";
import { usePlaylists } from "@/context/PlaylistContext";
import { toast } from "sonner";

export function CreatePlaylistModal() {
  const {
    isCreateModalOpen,
    closeCreatePlaylistModal,
    createPlaylist,
    updatePlaylist,
    editingPlaylist,
    pendingTrackForNewPlaylist,
    addTrackToPlaylist,
  } = usePlaylists();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  useEffect(() => {
    if (editingPlaylist) {
      setName(editingPlaylist.name);
      setDescription(editingPlaylist.description || "");
      setCoverUrl(editingPlaylist.coverUrl || "");
      setCoverPreview(editingPlaylist.coverUrl || null);
    } else {
      setName("");
      setDescription("");
      setCoverUrl("");
      setCoverPreview(pendingTrackForNewPlaylist?.cover || null);
    }
  }, [editingPlaylist, pendingTrackForNewPlaylist, isCreateModalOpen]);

  if (!isCreateModalOpen) return null;

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image file size must be under 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setCoverUrl(result);
      setCoverPreview(result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Please enter an album/playlist name");
      return;
    }

    if (editingPlaylist) {
      updatePlaylist(editingPlaylist.id, {
        name: trimmedName,
        description: description.trim(),
        coverUrl: coverUrl.trim() || null,
      });
    } else {
      const created = createPlaylist({
        name: trimmedName,
        description: description.trim(),
        coverUrl: coverUrl.trim() || null,
        initialTrack: pendingTrackForNewPlaylist || undefined,
      });
    }

    closeCreatePlaylistModal();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeCreatePlaylistModal}
          className="fixed inset-0 bg-black/75 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 12 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 flex w-full max-w-lg flex-col rounded-3xl border border-white/10 bg-[#12191D]/95 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl text-white"
        >
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-teal-400" />
              <h2 className="text-lg font-extrabold text-white tracking-tight">
                {editingPlaylist ? "Edit Album / Playlist" : "Create New Album / Playlist"}
              </h2>
            </div>
            <button
              type="button"
              onClick={closeCreatePlaylistModal}
              className="grid size-8 place-items-center rounded-full text-white/60 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {/* Cover Upload / Preview */}
            <div className="flex items-center gap-4">
              <div className="relative group size-24 rounded-2xl overflow-hidden bg-black/40 border border-white/10 shrink-0 flex items-center justify-center">
                {coverPreview ? (
                  <img src={coverPreview} alt="Cover preview" className="size-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center text-white/40">
                    <Music2 className="size-8" />
                    <span className="text-[10px] mt-1 font-medium">No Cover</span>
                  </div>
                )}
                <label className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-xs font-semibold text-teal-300">
                  <ImagePlus className="size-5 mb-1" />
                  <span>Upload</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="min-w-0 flex-1 space-y-1.5">
                <label className="text-xs font-bold text-white/90">Cover Artwork (Optional)</label>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Upload an image or leave blank to automatically use album track artwork.
                </p>
                <input
                  type="text"
                  value={coverUrl.startsWith("data:") ? "(Custom Uploaded Image)" : coverUrl}
                  onChange={(e) => {
                    if (!e.target.value.startsWith("(Custom Uploaded Image)")) {
                      setCoverUrl(e.target.value);
                      setCoverPreview(e.target.value || null);
                    }
                  }}
                  placeholder="Or paste image URL (https://...)"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white placeholder-white/40 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
                />
              </div>
            </div>

            {/* Name Input */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-white/90">
                Title <span className="text-teal-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Midnight Beats, Bangla Acoustic..."
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-white/40 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
              />
            </div>

            {/* Description Input */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-white/90">Description</label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Give your album or playlist a catchy vibe description..."
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs text-white placeholder-white/40 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400 resize-none"
              />
            </div>

            {pendingTrackForNewPlaylist && !editingPlaylist && (
              <div className="rounded-2xl border border-teal-400/20 bg-teal-400/5 p-3 text-xs text-teal-300">
                ✨ Will automatically include <strong>"{pendingTrackForNewPlaylist.title}"</strong> as the first track!
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={closeCreatePlaylistModal}
                className="rounded-full px-5 py-2 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-full bg-[#4FD1C5] px-6 py-2 text-xs font-bold text-[#071012] shadow-lg shadow-teal-500/20 transition-transform active:scale-95 hover:bg-[#4FD1C5]/90 cursor-pointer"
              >
                {editingPlaylist ? "Save Changes" : "Create Playlist"}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
