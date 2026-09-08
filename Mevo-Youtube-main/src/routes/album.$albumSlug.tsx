import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LoaderCircle, Pencil, Trash2, FolderPlus, Plus } from "lucide-react";
import { useMusicLibrary } from "@/hooks/useMusicLibrary";
import { usePlayer } from "@/lib/player-context";
import { usePlaylists, getPlaylistDisplayCover } from "@/context/PlaylistContext";
import { formatAlbumDuration, shuffleArray, sumDuration } from "@/lib/collection-utils";
import { CollectionHeader } from "@/components/music/collection-header";
import { SongList } from "@/components/music/song-list";
import { AppBackButton } from "@/components/music/app-back-button";
import { toast } from "sonner";
import { SongListRow } from "@/components/music/song-list-row";

export const Route = createFileRoute("/album/$albumSlug")({
  component: AlbumDetailsPage,
});

function AlbumDetailsPage() {
  const { albumSlug } = Route.useParams();
  const player = usePlayer();
  const navigate = useNavigate();
  const { albums, isLoading: isLibraryLoading, error: loadError } = useMusicLibrary();
  const { getPlaylist, openCreatePlaylistModal, deletePlaylist, removeTrackFromPlaylist } =
    usePlaylists();

  const userPlaylist = useMemo(() => {
    return getPlaylist(albumSlug);
  }, [getPlaylist, albumSlug]);

  const studioAlbum = useMemo(() => {
    return albums.find((group) => group.slug === albumSlug);
  }, [albums, albumSlug]);

  const isCustomPlaylist = Boolean(userPlaylist);

  const album = useMemo(() => {
    if (userPlaylist) {
      return {
        name: userPlaylist.name,
        artist: "Created by You",
        slug: userPlaylist.slug,
        cover: getPlaylistDisplayCover(userPlaylist) || "",
        tracks: userPlaylist.tracks,
        description: userPlaylist.description,
        year: new Date(userPlaylist.createdAt).getFullYear(),
      };
    }
    return studioAlbum;
  }, [userPlaylist, studioAlbum]);

  const songs = album?.tracks ?? [];
  const totalDuration = sumDuration(songs);
  const hasSongs = songs.length > 0;

  const queueSource = useMemo(
    () => ({
      type: "album" as const,
      id: albumSlug,
      title: album?.name ?? "Album",
    }),
    [albumSlug, album?.name],
  );

  const navigationSource = useMemo(
    () => ({
      ...queueSource,
      pathname: `/album/${albumSlug}`,
      label: album?.name ?? "Album",
    }),
    [queueSource, albumSlug, album?.name],
  );

  const handleDeleteAlbum = () => {
    if (!userPlaylist) return;
    if (window.confirm(`Are you sure you want to delete "${userPlaylist.name}"?`)) {
      deletePlaylist(userPlaylist.id);
      void navigate({ to: "/albums" });
    }
  };

  if (isLibraryLoading && !album) {
    return (
      <div className="mx-auto max-w-6xl px-6 pb-16 md:px-12">
        <AppBackButton fallbackTo="/albums" />
        <div className="flex items-center gap-2 rounded-3xl glass p-8 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin text-emerald-400" />
          Mastering album tracks...
        </div>
      </div>
    );
  }

  if (loadError && !album) {
    return (
      <div className="mx-auto max-w-6xl px-6 pb-16 md:px-12">
        <AppBackButton fallbackTo="/albums" />
        <p className="text-sm text-red-500" role="alert">
          {loadError}
        </p>
      </div>
    );
  }

  if (!album) {
    return (
      <div className="mx-auto max-w-6xl px-6 pb-16 md:px-12">
        <AppBackButton fallbackTo="/albums" />
        <div className="rounded-3xl glass p-10 text-center">
          <p className="font-semibold text-white">Album not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been updated or moved. Explore our latest Studio Master Editions.
          </p>
        </div>
      </div>
    );
  }

  const isCurrentPlaying =
    player.queueSource?.type === queueSource.type &&
    player.queueSource?.id === queueSource.id &&
    player.current !== null;

  const isShuffled = isCurrentPlaying && player.shuffle;

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pb-20 md:px-12">
      <AppBackButton fallbackTo="/albums" />

      <CollectionHeader
        type="album"
        image={album.cover}
        title={album.name}
        subtitle={`${album.artist} · ${album.year ? `${album.year} · ` : ""}${songs.length} ${songs.length === 1 ? "track" : "tracks"} · ${formatAlbumDuration(totalDuration)}`}
        songCount={songs.length}
        totalDuration={totalDuration}
        disabled={!hasSongs}
        isShuffled={isShuffled}
        onPlayAll={() => {
          if (hasSongs) {
            player.playFromCollection(
              songs,
              0,
              queueSource,
              navigationSource,
              isCustomPlaylist ? "custom_playlist" : undefined,
            );
          }
        }}
        onShuffle={() => {
          if (!hasSongs) return;
          if (isCurrentPlaying) {
            player.toggleShuffle();
          } else {
            const shuffled = shuffleArray(songs);
            player.playFromCollection(
              shuffled,
              0,
              queueSource,
              navigationSource,
              isCustomPlaylist ? "custom_playlist" : undefined,
            );
            if (!player.shuffle) {
              player.toggleShuffle();
            }
          }
        }}
      />

      {/* Custom Playlist Management Actions (Edit, Delete) */}
      {isCustomPlaylist && userPlaylist && (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => openCreatePlaylistModal(userPlaylist)}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/90 backdrop-blur-md transition-all hover:bg-white/10 active:scale-95 cursor-pointer"
          >
            <Pencil className="size-3.5 text-teal-400" />
            <span>Edit Details</span>
          </button>
          <button
            type="button"
            onClick={handleDeleteAlbum}
            className="flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 backdrop-blur-md transition-all hover:bg-red-500/20 active:scale-95 cursor-pointer"
          >
            <Trash2 className="size-3.5 text-red-400" />
            <span>Delete Album</span>
          </button>
        </div>
      )}

      <div className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-400">
            {isCustomPlaylist ? "Playlist Tracks" : "Studio Tracklist"} ({songs.length})
          </h2>
          <span className="text-xs text-muted-foreground font-mono">
            {isCustomPlaylist ? "Custom Edition" : "Lossless Master Quality"}
          </span>
        </div>

        {songs.length === 0 ? (
          <div className="rounded-3xl glass p-10 text-center">
            <FolderPlus className="mx-auto mb-3 size-10 text-teal-400/80" />
            <p className="font-bold text-white text-base">This playlist is empty</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
              Tap the 3-dot menu or "Add to Playlist" on any song card to add tracks to this album.
            </p>
          </div>
        ) : isCustomPlaylist && userPlaylist ? (
          <div className="space-y-2 rounded-3xl glass p-3 md:p-4 transform-gpu">
            {songs.map((song, index) => (
              <div key={song.id} className="relative group/row flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <SongListRow
                    song={song}
                    collectionSongs={songs}
                    collectionIndex={index}
                    queueSource={queueSource}
                    showAlbum={true}
                    navigationSource={navigationSource}
                    playbackSource="custom_playlist"
                  />
                </div>
                <button
                  type="button"
                  title="Remove track from playlist"
                  onClick={() => removeTrackFromPlaylist(userPlaylist.id, song.id)}
                  className="grid size-9 place-items-center rounded-2xl text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-colors opacity-0 group-hover/row:opacity-100 shrink-0 cursor-pointer"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <SongList
            songs={songs}
            queueSource={queueSource}
            navigationSource={navigationSource}
            playbackSource={isCustomPlaylist ? "custom_playlist" : undefined}
            emptyMessage="No songs in this album yet."
          />
        )}
      </div>
    </div>
  );
}
