import { toast } from "sonner";
import { useEffect, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import { getAudioDuration } from "@/lib/audio-metadata";
import { prepareCoverImage } from "@/lib/cover-image";

import {
  addSongToTrending,
  removeSongFromTrending,
  replaceSongAudio,
  replaceSongCover,
  updateSong,
  type Song,
  type SongSection,
} from "@/services/songService";

import { SectionSelect } from "./upload/DraftFields";

interface EditSongDialogProps {
  song: Song | null;
  isTrending: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

/**
 * Full edit surface for one published song.
 * Cover and audio replacement never delete the old file before the new one
 * is uploaded and saved successfully.
 */
export function EditSongDialog({
  song,
  isTrending,
  open,
  onOpenChange,
  onSaved,
}: EditSongDialogProps) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [album, setAlbum] = useState("");
  const [genre, setGenre] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [section, setSection] = useState<SongSection>("bangla-beats");
  const [published, setPublished] = useState(true);
  const [trending, setTrending] = useState(false);

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!song) {
      return;
    }

    setTitle(song.title);
    setArtist(song.artist);
    setAlbum(song.album ?? "");
    setGenre(song.genre ?? "");
    setReleaseDate(song.release_date ?? "");
    setSection(song.section);
    setPublished(song.published);
    setTrending(isTrending);
    setStatus("");
    setError("");
  }, [song, isTrending]);

  if (!song) {
    return null;
  }

  async function handleSave() {
    if (!song) return;

    setSaving(true);
    setStatus("Saving changes...");
    setError("");

    try {
      await updateSong(song.id, {
        title,
        artist,
        album: album.trim() ? album.trim() : null,
        genre: genre.trim() ? genre.trim() : null,
        section,
        releaseDate: releaseDate.trim() ? releaseDate.trim() : null,
        published,
      });

      if (trending !== isTrending) {
        setStatus("Updating Trending selection...");

        if (trending) {
          await addSongToTrending(song.id);
        } else {
          await removeSongFromTrending(song.id);
        }
      }

      setStatus("Saved.");
      toast.success("Song updated successfully.");
      onSaved();
      onOpenChange(false);
    } catch (saveError) {
      console.error("Song update failed:", saveError);
      const errMsg = saveError instanceof Error ? saveError.message : "Could not save this song.";

      setError(errMsg);
      toast.error(errMsg);
      setStatus("");
    } finally {
      setSaving(false);
    }
  }

  async function handleCoverReplace(file: File | undefined) {
    if (!file || !song) return;

    setSaving(true);
    setStatus("Uploading new cover to Backblaze B2...");
    setError("");

    try {
      const prepared = await prepareCoverImage(file);
      await replaceSongCover(song.id, prepared.file);

      setStatus("Cover replaced.");
      toast.success("Cover artwork updated successfully.");
      onSaved();
    } catch (coverError) {
      console.error("Cover replacement failed:", coverError);
      const errMsg =
        coverError instanceof Error ? coverError.message : "Could not replace the cover image.";

      setError(errMsg);
      toast.error(errMsg);
      setStatus("");
    } finally {
      setSaving(false);
    }
  }

  async function handleAudioReplace(file: File | undefined) {
    if (!file || !song) return;

    setSaving(true);
    setStatus("Uploading new audio to Backblaze B2...");
    setError("");

    try {
      const duration = await getAudioDuration(file);

      await replaceSongAudio(song.id, file, {
        duration: duration ?? song.duration,
        originalFileName: file.name,
      });

      setStatus("Audio replaced. Song ID and statistics were kept.");
      toast.success("Audio track updated successfully.");
      onSaved();
    } catch (audioError) {
      console.error("Audio replacement failed:", audioError);
      const errMsg =
        audioError instanceof Error ? audioError.message : "Could not replace the audio file.";

      setError(errMsg);
      toast.error(errMsg);
      setStatus("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit song</DialogTitle>

          <DialogDescription>
            Replacing audio or artwork keeps the same song, its plays and its Trending position.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium">Title</label>
            <Input
              value={title}
              disabled={saving}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Artist</label>
            <Input
              value={artist}
              disabled={saving}
              onChange={(event) => setArtist(event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Album</label>
            <Input
              value={album}
              placeholder="Leave empty for a single"
              disabled={saving}
              onChange={(event) => setAlbum(event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Genre</label>
            <Input
              value={genre}
              disabled={saving}
              onChange={(event) => setGenre(event.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Release date</label>
            <Input
              type="date"
              value={releaseDate}
              disabled={saving}
              onChange={(event) => setReleaseDate(event.target.value)}
            />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium">Section</label>
            <SectionSelect value={section} disabled={saving} onChange={setSection} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <p className="text-sm font-medium">Published</p>
            <Switch checked={published} disabled={saving} onCheckedChange={setPublished} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <p className="text-sm font-medium">In Trending</p>
            <Switch checked={trending} disabled={saving} onCheckedChange={setTrending} />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Replace cover image</label>
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={saving}
              onChange={(event) => void handleCoverReplace(event.target.files?.[0])}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Replace audio file</label>
            <Input
              type="file"
              accept=".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/wav"
              disabled={saving}
              onChange={(event) => void handleAudioReplace(event.target.files?.[0])}
            />
          </div>
        </div>

        {status && <p className="text-sm text-muted-foreground">{status}</p>}

        {error && <p className="text-sm text-red-500">{error}</p>}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>

          <Button type="button" disabled={saving} onClick={handleSave}>
            {saving ? "Working..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
