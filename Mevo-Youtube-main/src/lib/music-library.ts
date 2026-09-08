/**
 * Unified Live Music Library Store & Aggregator
 * Auto-syncs live YouTube homepage feeds and local database songs for Artists & Albums.
 */

import {
  type Song as PlayerSong,
  type SectionId,
  belongsToSection,
  replaceRuntimeSongs,
} from "@/data/songs";
import { getSongs } from "@/services/songService";
import { getArtists, type Artist as DbArtist } from "@/services/artistService";
import { getPublishedCustomAlbums, type CustomAlbum } from "@/services/customAlbumService";
import { databaseSongToPlayerSong } from "@/lib/song-adapter";
import { HOME_SECTIONS } from "@/lib/category-config";
import {
  fetchYouTubeTrending,
  fetchYouTubeCategoryTracks,
} from "@/services/youtube";
import {
  groupSongsByArtist,
  groupSongsByAlbum,
  type ArtistGroup,
  type AlbumGroup,
} from "@/lib/collection-utils";
import { getPrependedTracks } from "@/lib/category-matcher";

const LOCAL_STORAGE_CATALOGUE_KEY = "mevo_cached_catalogue";

/** Safely read cached catalogue from localStorage */
export function getCachedCatalogue(): PlayerSong[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_CATALOGUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Safely persist catalogue to localStorage */
export function setCachedCatalogue(songs: PlayerSong[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_CATALOGUE_KEY, JSON.stringify(songs.slice(0, 300)));
  } catch {
    // Ignore storage quota errors
  }
}

export interface UnifiedMusicLibraryData {
  allSongs: PlayerSong[];
  artists: ArtistGroup[];
  albums: AlbumGroup[];
  dbArtists: DbArtist[];
  customAlbums: CustomAlbum[];
}

/**
 * Fetches all songs across all homepage categories (YouTube + Local Database)
 * and returns a deduplicated, rich catalog.
 */
export async function fetchUnifiedCatalogue(): Promise<UnifiedMusicLibraryData> {
  const [dbSongsResult, dbArtistsResult, customAlbumsResult, ytResults] = await Promise.allSettled([
    getSongs().catch(() => []),
    getArtists().catch(() => []),
    getPublishedCustomAlbums().catch(() => []),
    Promise.allSettled(
      HOME_SECTIONS.map(async (sec) => {
        if (sec.source !== "youtube") return { id: sec.id, songs: [] };
        try {
          if (sec.type === "chart") {
            const songs = await fetchYouTubeTrending(
              sec.regionCode || "BD",
              50,
              "bangla",
              sec.title
            );
            return { id: sec.id, songs };
          } else if (sec.type === "search" && sec.query) {
            const sectionId: SectionId =
              sec.id === "bengal-echo"
                ? "bangla"
                : sec.id === "hindi-reverie"
                  ? "hindi"
                  : sec.id === "english-essence"
                    ? "english"
                    : sec.id === "boost-aura"
                      ? "boost-aura"
                      : "global";

            const songs = await fetchYouTubeCategoryTracks(
              sec.query,
              sec.order || "viewCount",
              50,
              sectionId,
              sec.title
            );
            return { id: sec.id, songs };
          }
        } catch (err) {
          console.warn(`Failed to fetch section ${sec.id} in catalogue fetch:`, err);
        }
        return { id: sec.id, songs: [] };
      })
    ),
  ]);

  const rawDbSongs = dbSongsResult.status === "fulfilled" ? dbSongsResult.value : [];
  const dbArtists = dbArtistsResult.status === "fulfilled" ? dbArtistsResult.value : [];
  const customAlbums = customAlbumsResult.status === "fulfilled" ? customAlbumsResult.value : [];

  const convertedDbSongs = rawDbSongs.map((s) => databaseSongToPlayerSong(s));
  const allSongsList: PlayerSong[] = [];

  // Add Prepended user tracks
  const prependedMap = getPrependedTracks();
  for (const tracks of Object.values(prependedMap)) {
    if (Array.isArray(tracks)) {
      allSongsList.push(...tracks);
    }
  }

  // Add DB songs
  allSongsList.push(...convertedDbSongs);

  // Add YouTube songs
  if (ytResults.status === "fulfilled" && Array.isArray(ytResults.value)) {
    for (const r of ytResults.value) {
      if (r.status === "fulfilled" && r.value?.songs) {
        allSongsList.push(...r.value.songs);
      }
    }
  }

  // Deduplicate by ID
  const seenIds = new Set<string>();
  const uniqueSongs: PlayerSong[] = [];

  for (const s of allSongsList) {
    if (!s || !s.id) continue;
    if (!seenIds.has(s.id)) {
      seenIds.add(s.id);
      uniqueSongs.push(s);
    }
  }

  // Fallback to local storage cache if network returned very few items
  const finalSongs = uniqueSongs.length > 0 ? uniqueSongs : getCachedCatalogue();

  // Save to cache
  if (finalSongs.length > 0) {
    setCachedCatalogue(finalSongs);
    replaceRuntimeSongs(finalSongs);
  }

  // Parse Artists and Albums
  const artists = groupSongsByArtist(finalSongs, dbArtists);
  const albums = groupSongsByAlbum(finalSongs, customAlbums);

  return {
    allSongs: finalSongs,
    artists,
    albums,
    dbArtists,
    customAlbums,
  };
}
