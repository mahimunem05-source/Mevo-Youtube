import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Heart, LoaderCircle, Music2, Play, Shuffle } from "lucide-react";
import { usePlayer } from "@/lib/player-context";
import { getSongs, type Song as DatabaseSong } from "@/services/songService";
import { databaseSongToPlayerSong } from "@/lib/song-adapter";
import { SongCard } from "@/components/music/song-card";
import { PageHeader } from "@/components/music/page-header";
import type { Song } from "@/data/songs";

export const Route = createFileRoute("/favorites")({
  head: () => ({
    meta: [
      { title: "Favorites — MEVO" },
      { name: "description", content: "Your liked songs on MEVO." },
    ],
  }),
  component: FavoritesPage,
});

function FavoritesPage() {
  const player = usePlayer();
  const [databaseSongs, setDatabaseSongs] = useState<Song[]>([]);
  const [isDbLoading, setIsDbLoading] = useState(true);

  // Background fetch published database songs in case user liked database songs
  useEffect(() => {
    let isMounted = true;
    async function loadDb() {
      try {
        const fetched = await getSongs();
        if (isMounted) {
          setDatabaseSongs(fetched.map((s) => databaseSongToPlayerSong(s)));
        }
      } catch (err) {
        console.warn("Failed to load db songs for favorites:", err);
      } finally {
        if (isMounted) {
          setIsDbLoading(false);
        }
      }
    }
    void loadDb();
    return () => {
      isMounted = false;
    };
  }, []);

  // Reactive liked songs combining context favoriteSongs with any liked DB songs
  const likedSongs = useMemo(() => {
    const map = new Map<string, Song>();

    // 1. First add all full Song objects from persistent favorite store
    player.favoriteSongs.forEach((song) => {
      if (player.isLiked(song.id)) {
        map.set(song.id, song);
      }
    });

    // 2. Add any database songs whose id is liked
    databaseSongs.forEach((song) => {
      if (player.isLiked(song.id) && !map.has(song.id)) {
        map.set(song.id, song);
      }
    });

    return Array.from(map.values());
  }, [player.favoriteSongs, player.likes, databaseSongs, player.isLiked]);

  const handlePlayAll = () => {
    if (likedSongs.length === 0) return;
    player.playFromCollection(
      likedSongs,
      0,
      { type: "favourite", id: "favorites", title: "Favorites" }
    );
  };

  const handleShuffle = () => {
    if (likedSongs.length === 0) return;
    const randomIndex = Math.floor(Math.random() * likedSongs.length);
    if (!player.shuffle) {
      player.toggleShuffle();
    }
    player.playFromCollection(
      likedSongs,
      randomIndex,
      { type: "favourite", id: "favorites", title: "Favorites" }
    );
  };

  return (
    <div className="pb-24">
      <PageHeader
        eyebrow="Collection"
        title="Your Favorites"
        subtitle={
          likedSongs.length > 0
            ? `${likedSongs.length} track${likedSongs.length === 1 ? "" : "s"} saved to your library.`
            : "The tracks you've saved and loved."
        }
      />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-12">
        {likedSongs.length > 0 && (
          <div className="mb-6 flex items-center gap-3">
            <button
              type="button"
              onClick={handlePlayAll}
              className="flex items-center gap-2 rounded-full bg-[#4FD1C5] px-5 py-2.5 text-xs font-bold text-[#071012] shadow-lg shadow-teal-500/20 transition-transform active:scale-95 hover:bg-[#4FD1C5]/90 cursor-pointer"
            >
              <Play className="size-3.5 fill-current" />
              <span>Play All</span>
            </button>
            <button
              type="button"
              onClick={handleShuffle}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white/90 backdrop-blur-md transition-all hover:bg-white/10 active:scale-95 cursor-pointer"
            >
              <Shuffle className="size-3.5 text-teal-400" />
              <span>Shuffle</span>
            </button>
          </div>
        )}

        {likedSongs.length === 0 ? (
          isDbLoading && player.favoriteSongs.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin text-primary" /> Loading favorites...
            </div>
          ) : (
            <div className="rounded-3xl glass p-12 text-center">
              <Heart className="mx-auto mb-3 size-10 text-teal-400/80 animate-pulse" />
              <p className="text-lg font-bold text-white">No favorites yet</p>
              <p className="mt-1.5 text-sm text-muted-foreground max-w-sm mx-auto">
                Tap the heart icon on any song, carousel track, or player view to save it here.
              </p>
            </div>
          )
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {likedSongs.map((song, index) => (
              <SongCard
                key={song.id}
                song={song}
                compact
                collectionSongs={likedSongs}
                collectionIndex={index}
                queueSource={{ type: "favourite", id: "favorites", title: "Favorites" }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
