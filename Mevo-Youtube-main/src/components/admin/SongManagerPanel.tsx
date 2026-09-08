import { useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  addSongToTrending,
  deleteSong,
  removeSongFromTrending,
  SONG_SECTION_OPTIONS,
  type Song,
} from "@/services/songService";

import { EditSongDialog } from "./EditSongDialog";

interface SongManagerPanelProps {
  songs: Song[];
  trendingIds: string[];
  loading: boolean;
  error: string;
  focusSongId: string | null;
  onRefresh: () => void;
  onFocusHandled: () => void;
}

function sectionLabel(value: string): string {
  return SONG_SECTION_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

/** Searchable song library with edit, trending and safe delete actions. */
export function SongManagerPanel({
  songs,
  trendingIds,
  loading,
  error,
  focusSongId,
  onRefresh,
  onFocusHandled,
}: SongManagerPanelProps) {
  const [query, setQuery] = useState("");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [editingSong, setEditingSong] = useState<Song | null>(null);
  const [deletingSong, setDeletingSong] = useState<Song | null>(null);
  const [working, setWorking] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (!focusSongId) {
      return;
    }

    const target = songs.find((song) => song.id === focusSongId);

    if (target) {
      setQuery(target.title);
      setEditingSong(target);
    }

    onFocusHandled();
  }, [focusSongId, songs, onFocusHandled]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    return songs.filter((song) => {
      if (sectionFilter !== "all" && song.section !== sectionFilter) {
        return false;
      }

      if (!term) {
        return true;
      }

      return (
        normalize(song.title).includes(term) ||
        normalize(song.artist).includes(term) ||
        normalize(song.album).includes(term)
      );
    });
  }, [songs, query, sectionFilter]);

  async function runAction(action: () => Promise<void>, successMessage: string) {
    setWorking(true);
    setActionMessage("");
    setActionError("");

    try {
      await action();
      setActionMessage(successMessage);
      onRefresh();
    } catch (error_) {
      console.error("Song action failed:", error_);

      setActionError(error_ instanceof Error ? error_.message : "Action failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage Songs</CardTitle>

        <CardDescription>
          Search the library, edit details, control Trending, or safely replace and remove songs.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            value={query}
            placeholder="Search by title, artist or album"
            onChange={(event) => setQuery(event.target.value)}
          />

          <select
            value={sectionFilter}
            onChange={(event) => setSectionFilter(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All sections</option>

            {SONG_SECTION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading songs...</p>}

        {error && <p className="text-sm text-red-500">{error}</p>}

        {!loading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">No songs found.</p>
        )}

        <div className="space-y-2">
          {filtered.map((song) => {
            const isTrending = trendingIds.includes(song.id);

            return (
              <div
                key={song.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border p-3"
              >
                {song.cover_image ? (
                  <img
                    src={song.cover_image}
                    alt={`${song.title} cover`}
                    className="size-12 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <div className="size-12 shrink-0 rounded-md border border-dashed" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{song.title}</p>

                  <p className="truncate text-xs text-muted-foreground">
                    {song.artist}
                    {song.album ? ` — ${song.album}` : " — Single"} · {sectionLabel(song.section)}
                    {song.published ? "" : " · Unpublished"}
                    {isTrending ? " · Trending" : ""}
                  </p>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={working}
                  onClick={() =>
                    void runAction(
                      async () => {
                        if (isTrending) {
                          await removeSongFromTrending(song.id);
                        } else {
                          await addSongToTrending(song.id);
                        }
                      },
                      isTrending ? "Removed from Trending." : "Added to Trending.",
                    )
                  }
                >
                  {isTrending ? "Remove Trending" : "Add Trending"}
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={working}
                  onClick={() => setEditingSong(song)}
                >
                  Edit
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={working}
                  onClick={() => setDeletingSong(song)}
                >
                  Delete
                </Button>
              </div>
            );
          })}
        </div>

        {actionMessage && <p className="text-sm text-green-500">{actionMessage}</p>}

        {actionError && <p className="text-sm text-red-500">{actionError}</p>}
      </CardContent>

      <EditSongDialog
        song={editingSong}
        isTrending={editingSong ? trendingIds.includes(editingSong.id) : false}
        open={Boolean(editingSong)}
        onOpenChange={(open) => {
          if (!open) setEditingSong(null);
        }}
        onSaved={onRefresh}
      />

      <AlertDialog
        open={Boolean(deletingSong)}
        onOpenChange={(open) => {
          if (!open) setDeletingSong(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this song?</AlertDialogTitle>

            <AlertDialogDescription>
              {deletingSong?.title} will be removed from the library, from Trending, and its audio
              file will be deleted. Shared cover images are kept. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>

            <AlertDialogAction
              disabled={working}
              onClick={() => {
                const target = deletingSong;
                setDeletingSong(null);

                if (target) {
                  void runAction(async () => {
                    await deleteSong(target.id);
                  }, "Song deleted.");
                }
              }}
            >
              Delete song
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
