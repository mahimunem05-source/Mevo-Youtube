import { supabase } from "@/lib/supabase";

/**
 * MEVO has no separate albums table — albums are derived from the `album`
 * column of the songs table. This service keeps that architecture and only
 * adds normalised matching so "ARJN", "Arjn " and "arjn" never become three
 * different albums.
 */

const SONGS_TABLE = "songs";

export interface ExistingAlbum {
  name: string;
  artist: string | null;
  cover: string | null;
  songCount: number;
}

export type AlbumMatchStatus = "single" | "matched" | "new";

export interface AlbumResolution {
  status: AlbumMatchStatus;
  /** The exact value that should be written to songs.album (null = single). */
  albumName: string | null;
  existing: ExistingAlbum | null;
  message: string;
}

const SINGLE_ALIASES = new Set([
  "single",
  "singles",
  "unknown",
  "unknown album",
  "n/a",
  "none",
  "",
]);

/** Lowercased, trimmed, internal-whitespace-collapsed album key. */
export function normalizeAlbumKey(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function normalizeArtistKey(value: string | null | undefined): string {
  return normalizeAlbumKey(value);
}

export function isSingleAlbumValue(value: string | null | undefined): boolean {
  return SINGLE_ALIASES.has(normalizeAlbumKey(value));
}

interface AlbumRow {
  album: string | null;
  artist_name: string | null;
  cover_image: string | null;
}

/** Loads every distinct album currently derived from the songs table. */
export async function getExistingAlbums(): Promise<ExistingAlbum[]> {
  const { data, error } = await supabase
    .from(SONGS_TABLE)
    .select("album, artist_name, cover_image")
    .not("album", "is", null);

  if (error) {
    console.error("Could not load albums:", error);
    return [];
  }

  const grouped = new Map<string, ExistingAlbum>();

  for (const row of (data ?? []) as AlbumRow[]) {
    const name = (row.album ?? "").replace(/\s+/g, " ").trim();

    if (!name || isSingleAlbumValue(name)) {
      continue;
    }

    const key = `${normalizeAlbumKey(name)}::${normalizeArtistKey(row.artist_name)}`;

    const existing = grouped.get(key);

    if (existing) {
      existing.songCount += 1;
      existing.cover = existing.cover ?? row.cover_image;
      continue;
    }

    grouped.set(key, {
      name,
      artist: row.artist_name,
      cover: row.cover_image,
      songCount: 1,
    });
  }

  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Decides how an uploaded song should be connected to album data.
 * Never creates a duplicate album: an existing canonical name wins.
 */
export async function resolveAlbum(
  albumName: string | null | undefined,
  artistName: string | null | undefined,
): Promise<AlbumResolution> {
  const cleaned = (albumName ?? "").replace(/\s+/g, " ").trim();

  if (!cleaned || isSingleAlbumValue(cleaned)) {
    return {
      status: "single",
      albumName: null,
      existing: null,
      message: "No album metadata — this song will be treated as a single.",
    };
  }

  const albums = await getExistingAlbums();
  const albumKey = normalizeAlbumKey(cleaned);
  const artistKey = normalizeArtistKey(artistName);

  const sameArtistMatch = albums.find(
    (album) =>
      normalizeAlbumKey(album.name) === albumKey && normalizeArtistKey(album.artist) === artistKey,
  );

  const nameOnlyMatch = albums.find((album) => normalizeAlbumKey(album.name) === albumKey);

  const match = sameArtistMatch ?? nameOnlyMatch ?? null;

  if (match) {
    return {
      status: "matched",
      // Reuse the existing canonical spelling.
      albumName: match.name,
      existing: match,
      message: `Existing album matched: ${match.name}`,
    };
  }

  return {
    status: "new",
    albumName: cleaned,
    existing: null,
    message: `New album will be created: ${cleaned}`,
  };
}
