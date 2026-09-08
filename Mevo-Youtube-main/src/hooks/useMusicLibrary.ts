import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  fetchUnifiedCatalogue,
  getCachedCatalogue,
  type UnifiedMusicLibraryData,
} from "@/lib/music-library";
import { groupSongsByArtist, groupSongsByAlbum } from "@/lib/collection-utils";
import type { Song as PlayerSong } from "@/data/songs";

export function useMusicLibrary() {
  const query = useQuery<UnifiedMusicLibraryData>({
    queryKey: ["unified-music-library"],
    queryFn: fetchUnifiedCatalogue,
    staleTime: 1000 * 60 * 15, // 15 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  // Hydrate initial synchronous cache from localStorage if query is still loading
  const initialData = useMemo(() => {
    if (query.data) return query.data;
    const cachedSongs = getCachedCatalogue();
    if (cachedSongs.length > 0) {
      return {
        allSongs: cachedSongs,
        artists: groupSongsByArtist(cachedSongs),
        albums: groupSongsByAlbum(cachedSongs),
        dbArtists: [],
        customAlbums: [],
      };
    }
    return null;
  }, [query.data]);

  const allSongs: PlayerSong[] = query.data?.allSongs ?? initialData?.allSongs ?? [];
  const artists = query.data?.artists ?? initialData?.artists ?? [];
  const albums = query.data?.albums ?? initialData?.albums ?? [];
  const dbArtists = query.data?.dbArtists ?? [];
  const customAlbums = query.data?.customAlbums ?? [];

  const isLoading = query.isLoading && allSongs.length === 0;
  const isError = query.isError && allSongs.length === 0;
  const error = query.error instanceof Error ? query.error.message : null;

  return {
    allSongs,
    artists,
    albums,
    dbArtists,
    customAlbums,
    isLoading,
    isError,
    error,
    refetch: query.refetch,
  };
}
