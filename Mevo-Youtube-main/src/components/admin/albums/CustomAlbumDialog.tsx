import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { ACCEPTED_COVER_ACCEPT, prepareCoverImage } from "@/lib/cover-image";
import { SONG_SECTION_OPTIONS, type Song } from "@/services/songService";

import {
  createCustomAlbum,
  updateCustomAlbum,
  type CustomAlbum,
} from "@/services/customAlbumService";

interface CustomAlbumDialogProps {
  open: boolean;
  album: CustomAlbum | null;
  songs: Song[];
  initialSongIds?: string[];
  initialTitle?: string;
  initialArtist?: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

function sectionLabel(value: string): string {
  return SONG_SECTION_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function CustomAlbumDialog({
  open,
  album,
  songs,
  initialSongIds,
  initialTitle,
  initialArtist,
  onOpenChange,
  onSaved,
}: CustomAlbumDialogProps) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [description, setDescription] = useState("");
  const [albumType, setAlbumType] = useState("Studio Album");
  const [releaseDate, setReleaseDate] = useState("");
  const [published, setPublished] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setTitle(album?.title ?? initialTitle ?? "");
    setArtist(album?.artist ?? initialArtist ?? "");
    setDescription(album?.description ?? "");
    setAlbumType(album?.type ?? "Studio Album");
    setReleaseDate(album?.release_date ?? "");
    setPublished(album?.published ?? true);
    setSelectedIds(album?.songIds ?? initialSongIds ?? []);
    setCoverFile(null);
    setCoverPreview(album?.cover_url || album?.cover_image || null);
    setQuery("");
    setSectionFilter("all");
    setError("");
  }, [open, album, initialSongIds, initialTitle, initialArtist]);

  const songById = useMemo(() => {
    const map = new Map<string, Song>();
    for (const song of songs) map.set(song.id, song);
    return map;
  }, [songs]);

  const filteredSongs = useMemo(() => {
    const term = query.trim().toLowerCase();

    return songs.filter((song) => {
      if (sectionFilter !== "all" && song.section !== sectionFilter) {
        return false;
      }

      if (!term) {
        return true;
      }

      return (
        (song.title ?? "").toLowerCase().includes(term) ||
        (song.artist ?? "").toLowerCase().includes(term) ||
        (song.album ?? "").toLowerCase().includes(term)
      );
    });
  }, [songs, query, sectionFilter]);

  const selectedSongs = selectedIds
    .map((id) => songById.get(id))
    .filter((song): song is Song => Boolean(song));

  function toggleSong(songId: string) {
    setSelectedIds((current) =>
      current.includes(songId) ? current.filter((id) => id !== songId) : [...current, songId],
    );
  }

  function moveSong(from: number, to: number) {
    setSelectedIds((current) => {
      if (to < 0 || to >= current.length || from === to) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  async function handleCoverChange(file: File | undefined) {
    if (!file) return;

    try {
      const prepared = await prepareCoverImage(file);
      setCoverFile(prepared.file);
      setCoverPreview(prepared.previewUrl);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Could not read that cover image.");
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");

    try {
      const payload = {
        title,
        artist,
        description,
        type: albumType,
        releaseDate,
        published,
        songIds: selectedIds,
        coverFile,
      };

      if (album) {
        await updateCustomAlbum(album.id, payload);
      } else {
        await createCustomAlbum(payload);
      }

      onSaved();
      onOpenChange(false);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Could not save the album.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto bg-[#10171a] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {album ? "Edit Custom Album" : "Create Custom Album"}
          </DialogTitle>

          <DialogDescription className="text-white/60">
            Define custom album artwork, metadata, and track ordering without altering original song sections.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 sm:grid-cols-[160px_1fr]">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-white/80">Album Cover</Label>

            {coverPreview ? (
              <img
                src={coverPreview}
                alt="Album cover preview"
                className="aspect-square w-full rounded-2xl object-cover border border-white/10 shadow-lg"
              />
            ) : (
              <div className="grid aspect-square w-full place-items-center rounded-2xl border border-dashed border-white/20 bg-white/5 text-xs text-white/40">
                No cover
              </div>
            )}

            <Input
              type="file"
              accept={ACCEPTED_COVER_ACCEPT}
              disabled={saving}
              className="bg-black/30 border-white/10 text-xs file:text-teal-400"
              onChange={(event) => void handleCoverChange(event.target.files?.[0])}
            />
          </div>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="album-title" className="text-xs font-semibold text-white/80">
                  Album Title *
                </Label>

                <Input
                  id="album-title"
                  value={title}
                  disabled={saving}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g., Midnight Melodies"
                  className="bg-black/30 border-white/10"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="album-artist" className="text-xs font-semibold text-white/80">
                  Artist / Curator
                </Label>

                <Input
                  id="album-artist"
                  value={artist}
                  disabled={saving}
                  onChange={(event) => setArtist(event.target.value)}
                  placeholder="e.g., Munem Mahi or Various Artists"
                  className="bg-black/30 border-white/10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="album-description" className="text-xs font-semibold text-white/80">
                Description
              </Label>

              <Textarea
                id="album-description"
                value={description}
                disabled={saving}
                rows={2}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Short backstory or studio notes for this collection..."
                className="bg-black/30 border-white/10 text-xs"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="album-type" className="text-xs font-semibold text-white/80">
                  Album Badge / Type
                </Label>

                <select
                  id="album-type"
                  value={albumType}
                  disabled={saving}
                  onChange={(event) => setAlbumType(event.target.value)}
                  className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-xs text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="Studio Album">Studio Album</option>
                  <option value="Artist EP">Artist EP</option>
                  <option value="Studio Edition">Studio Edition</option>
                  <option value="Mix">Curated Mix</option>
                  <option value="Custom Album">Custom Album</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="album-release" className="text-xs font-semibold text-white/80">
                  Release Date
                </Label>

                <Input
                  id="album-release"
                  type="date"
                  value={releaseDate}
                  disabled={saving}
                  onChange={(event) => setReleaseDate(event.target.value)}
                  className="bg-black/30 border-white/10 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="album-status" className="text-xs font-semibold text-white/80">
                  Publish Status
                </Label>

                <select
                  id="album-status"
                  value={published ? "published" : "draft"}
                  disabled={saving}
                  onChange={(event) => setPublished(event.target.value === "published")}
                  className="h-10 w-full rounded-md border border-white/10 bg-black/40 px-3 text-xs text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="published">Published</option>
                  <option value="draft">Unpublished / Draft</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2 grid gap-5 md:grid-cols-2">
          {/* Song Selection */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-white/80">Select Songs</Label>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                value={query}
                placeholder="Search songs by title or artist..."
                onChange={(event) => setQuery(event.target.value)}
                className="bg-black/30 border-white/10 text-xs"
              />

              <select
                value={sectionFilter}
                onChange={(event) => setSectionFilter(event.target.value)}
                className="h-9 rounded-md border border-white/10 bg-black/40 px-2 text-xs text-white focus:outline-none"
              >
                <option value="all">All sections</option>
                {SONG_SECTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
              {filteredSongs.length === 0 && (
                <p className="p-2 text-xs text-white/40">No matching songs found.</p>
              )}

              {filteredSongs.map((song) => {
                const checked = selectedIds.includes(song.id);

                return (
                  <label
                    key={song.id}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg p-2 transition-colors ${
                      checked ? "bg-teal-500/15 text-white" : "hover:bg-white/5 text-white/80"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSong(song.id)}
                      className="rounded border-white/20 text-teal-500 focus:ring-0"
                    />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{song.title}</span>
                      <span className="block truncate text-[11px] text-white/40">
                        {song.artist} · {sectionLabel(song.section)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Selected Track Ordering */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-white/80">
              Tracklist Order ({selectedSongs.length} tracks)
            </Label>

            <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
              {selectedSongs.length === 0 && (
                <p className="p-2 text-xs text-white/40">No songs selected yet.</p>
              )}

              {selectedSongs.map((song, index) => (
                <div
                  key={song.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null) moveSong(dragIndex, index);
                    setDragIndex(null);
                  }}
                  className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/30 p-2"
                >
                  <span className="w-5 shrink-0 cursor-grab text-center font-mono text-xs text-teal-400 font-bold">
                    {index + 1}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-white">{song.title}</span>
                    <span className="block truncate text-[10px] text-white/50">{song.artist}</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => moveSong(index, index - 1)}
                    className="p-1 text-white/50 hover:text-white rounded hover:bg-white/10 text-xs"
                  >
                    ↑
                  </button>

                  <button
                    type="button"
                    onClick={() => moveSong(index, index + 1)}
                    className="p-1 text-white/50 hover:text-white rounded hover:bg-white/10 text-xs"
                  >
                    ↓
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleSong(song.id)}
                    className="px-2 py-0.5 text-[10px] font-semibold text-red-400 hover:bg-red-500/10 rounded"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-white/40">
              Use arrows or drag items to adjust track order.
            </p>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded-lg" role="alert">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
            className="border-white/10 text-xs hover:bg-white/5"
          >
            Cancel
          </Button>

          <Button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="bg-teal-500 hover:bg-teal-400 text-black text-xs font-bold"
          >
            {saving ? "Saving..." : album ? "Update Album" : "Create Album"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
