import { LoaderCircle, Music2 } from "lucide-react";
import type { NavigationSource, QueueSource, Song } from "@/data/songs";
import { SongCard } from "./song-card";

interface SongGridProps {
  songs: Song[];
  queueSource: QueueSource;
  isLoading?: boolean;
  emptyMessage?: string;
  navigationSource?: NavigationSource;
}

/**
 * Grid version of a song collection, for "See All" / section detail pages.
 *
 * Reuses the exact same SongCard the homepage carousels use (in its
 * `compact` size) so these pages get the same premium card look with
 * glow/hover effects instead of a plain numbered list — while keeping
 * queue/navigation wiring identical to SongList.
 */
export function SongGrid({
  songs,
  queueSource,
  isLoading = false,
  emptyMessage = "No songs here yet.",
  navigationSource,
}: SongGridProps) {
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-3xl glass p-6 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Loading songs...
      </div>
    );
  }

  if (songs.length === 0) {
    return (
      <div className="rounded-3xl glass p-10 text-center">
        <Music2 className="mx-auto mb-3 size-8 text-muted-foreground" />

        <p className="font-semibold">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      className="
      grid
      grid-cols-2
      gap-4
      sm:grid-cols-3
      md:grid-cols-4
      lg:grid-cols-5
      xl:grid-cols-6
      "
    >
      {songs.map((song, index) => (
        <SongCard
          key={song.id}
          song={song}
          compact
          collectionSongs={songs}
          collectionIndex={index}
          queueSource={queueSource}
          navigationSource={navigationSource}
        />
      ))}
    </div>
  );
}
