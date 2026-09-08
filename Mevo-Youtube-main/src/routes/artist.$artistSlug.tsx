import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { formatTime } from "@/data/songs";
import { useMusicLibrary } from "@/hooks/useMusicLibrary";
import { usePlayer } from "@/lib/player-context";
import {
  groupSongsByAlbum,
  shuffleArray,
  sumDuration,
} from "@/lib/collection-utils";
import { CollectionHeader } from "@/components/music/collection-header";
import { SongList } from "@/components/music/song-list";
import { AppBackButton } from "@/components/music/app-back-button";
import { SongCoverImage } from "@/components/music/song-cover-image";

export const Route = createFileRoute("/artist/$artistSlug")({
  component: ArtistDetailsPage,
});

function ArtistDetailsPage() {
  const { artistSlug } = Route.useParams();
  const player = usePlayer();
  const { artists, isLoading, error: loadError } = useMusicLibrary();

  const artist = useMemo(() => {
    return artists.find((group) => group.slug === artistSlug);
  }, [artists, artistSlug]);

  const songs = artist?.tracks ?? [];
  const albums = useMemo(() => groupSongsByAlbum(songs), [songs]);

  const totalDuration = sumDuration(songs);
  const hasSongs = songs.length > 0;

  const queueSource = useMemo(
    () => ({
      type: "artist" as const,
      id: artistSlug,
      title: artist?.name ?? "Artist",
    }),
    [artistSlug, artist?.name],
  );

  const navigationSource = useMemo(
    () => ({
      ...queueSource,
      pathname: `/artist/${artistSlug}`,
      label: artist?.name ?? "Artist",
    }),
    [queueSource, artistSlug, artist?.name],
  );

  if (isLoading && !artist) {
    return (
      <div className="mx-auto max-w-6xl px-6 pb-16 md:px-12">
        <AppBackButton fallbackTo="/artists" />
        <div className="flex items-center gap-2 rounded-3xl glass p-6 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin text-primary" />
          Loading artist discography...
        </div>
      </div>
    );
  }

  if (loadError && !artist) {
    return (
      <div className="mx-auto max-w-6xl px-6 pb-16 md:px-12">
        <AppBackButton fallbackTo="/artists" />
        <p className="text-sm text-red-500" role="alert">
          {loadError}
        </p>
      </div>
    );
  }

  if (!artist) {
    return (
      <div className="mx-auto max-w-6xl px-6 pb-16 md:px-12">
        <AppBackButton fallbackTo="/artists" />
        <div className="rounded-3xl glass p-10 text-center">
          <p className="font-semibold text-white">Artist not found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been removed or no tracks were found in the current catalogue.
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
    <div className="mx-auto max-w-6xl px-6 pb-16 md:px-12">
      <AppBackButton fallbackTo="/artists" />

      <CollectionHeader
        type="artist"
        image={artist.cover}
        title={artist.name}
        subtitle={`${songs.length} ${songs.length === 1 ? "song" : "songs"} · ${albums.length} ${albums.length === 1 ? "album" : "albums"}`}
        songCount={songs.length}
        totalDuration={totalDuration}
        disabled={!hasSongs}
        isShuffled={isShuffled}
        onPlayAll={() => {
          if (hasSongs) player.playFromCollection(songs, 0, queueSource, navigationSource);
        }}
        onShuffle={() => {
          if (!hasSongs) return;
          if (isCurrentPlaying) {
            player.toggleShuffle();
          } else {
            const shuffled = shuffleArray(songs);
            player.playFromCollection(shuffled, 0, queueSource, navigationSource);
            if (!player.shuffle) {
              player.toggleShuffle();
            }
          }
        }}
      />

      {albums.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Albums & Collections
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((album) => (
              <Link
                key={album.slug}
                to="/album/$albumSlug"
                params={{ albumSlug: album.slug }}
                className="flex items-center gap-3 rounded-2xl glass p-3 transition-shadow hover:glow-ring focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <SongCoverImage
                  src={album.cover}
                  alt={`${album.name} artwork`}
                  width={56}
                  height={56}
                  loading="eager"
                  decoding="auto"
                  className="size-14 shrink-0 rounded-xl object-cover"
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">{album.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {album.tracks.length} {album.tracks.length === 1 ? "track" : "tracks"} ·{" "}
                    {formatTime(sumDuration(album.tracks))}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="mt-10">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          All Songs
        </h2>
        <SongList
          songs={songs}
          queueSource={queueSource}
          navigationSource={navigationSource}
          emptyMessage="No songs from this artist yet."
        />
      </div>
    </div>
  );
}
