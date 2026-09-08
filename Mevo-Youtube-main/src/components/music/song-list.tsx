import { memo } from "react";
import { LoaderCircle, Music2 } from "lucide-react";
import type { NavigationSource, QueueSource, Song } from "@/data/songs";
import { SongListRow } from "./song-list-row";

interface SongListProps {
  songs: Song[];
  queueSource: QueueSource;
  isLoading?: boolean;
  emptyMessage?: string;
  showAlbum?: boolean;
  navigationSource?: NavigationSource;
  playbackSource?: string | null;
  isSeeAllView?: boolean;
  showIndex?: boolean;
}

/**
 * Reusable collection song list.
 *
 * Every row receives the complete collection and its real collection index so
 * Album, Artist, Section, Trending, and Recently Played queues remain intact.
 */
function SongListComponent({
  songs,
  queueSource,
  isLoading = false,
  emptyMessage = "No songs here yet.",
  showAlbum = true,
  navigationSource,
  playbackSource,
  isSeeAllView = false,
  showIndex = true,
}: SongListProps) {
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
    <div className="space-y-2 rounded-3xl glass p-3 md:p-4 transform-gpu">
      {songs.map((song, index) => (
        <SongListRow
          key={song.id}
          song={song}
          collectionSongs={songs}
          collectionIndex={index}
          queueSource={queueSource}
          showAlbum={showAlbum}
          navigationSource={navigationSource}
          playbackSource={playbackSource}
          isSeeAllView={isSeeAllView}
          showIndex={showIndex}
        />
      ))}
    </div>
  );
}

export const SongList = memo(SongListComponent);
