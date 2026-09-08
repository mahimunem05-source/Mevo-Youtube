import { supabase } from "@/lib/supabase";
import { slugify } from "@/lib/collection-utils";
import { deleteFileFromB2, uploadCoverToB2 } from "@/lib/b2-storage";

/**
 * Manual ("custom") albums for the MEVO admin.
 *
 * Custom albums reference existing song rows through `custom_album_tracks` or `album_songs`.
 */

const ALBUMS_TABLE = "custom_albums";
const TRACKS_TABLE = "custom_album_tracks";
const LEGACY_TRACKS_TABLE = "album_songs";

export const MAHI_EDITION_COLLECTION = "mahi-edition";

export interface CustomAlbum {
  id: string;
  title: string;
  slug: string;
  artist: string | null;
  description: string | null;
  type: string | null;
  cover_image: string | null;
  cover_url: string | null;
  cover_path: string | null;
  release_date: string | null;
  published: boolean;
  collection: string;
  display_order: number | null;
  created_at: string;
  updated_at: string;
  songIds: string[];
}

export interface CustomAlbumInput {
  title: string;
  artist?: string;
  description: string;
  type?: string;
  releaseDate: string;
  published: boolean;
  songIds: string[];
  coverFile?: File | null;
  collection?: string;
}

interface RawAlbumRow {
  id: string;
  title: string;
  slug?: string | null;
  artist?: string | null;
  description?: string | null;
  type?: string | null;
  cover_image?: string | null;
  cover_url?: string | null;
  cover_path?: string | null;
  release_date?: string | null;
  published?: boolean | null;
  collection?: string | null;
  display_order?: number | null;
  created_at?: string;
  updated_at?: string;
  custom_album_tracks?: { song_id: string; track_order?: number; position?: number }[] | null;
  album_songs?: { song_id: string; position?: number; track_order?: number }[] | null;
}

function mapAlbumRow(row: RawAlbumRow): CustomAlbum {
  const tracks = [
    ...(row.custom_album_tracks ?? []),
    ...(row.album_songs ?? []),
  ].sort((a, b) => (a.track_order ?? a.position ?? 0) - (b.track_order ?? b.position ?? 0));

  const uniqueSongIds = Array.from(new Set(tracks.map((t) => t.song_id)));
  const cover = row.cover_url || row.cover_image || null;

  return {
    id: row.id,
    title: row.title,
    slug: row.slug || slugify(row.title),
    artist: row.artist || null,
    description: row.description || null,
    type: row.type || "Custom Album",
    cover_image: cover,
    cover_url: cover,
    cover_path: row.cover_path || null,
    release_date: row.release_date || null,
    published: row.published ?? true,
    collection: row.collection || MAHI_EDITION_COLLECTION,
    display_order: row.display_order ?? 0,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString(),
    songIds: uniqueSongIds,
  };
}

async function uploadCover(file: File): Promise<{
  publicUrl: string;
  path: string;
}> {
  try {
    const { publicUrl, key } = await uploadCoverToB2(file);
    return { publicUrl, path: key };
  } catch (error) {
    throw new Error(
      `Could not upload album cover: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
}

async function buildUniqueSlug(title: string, ignoreId?: string): Promise<string> {
  const base = slugify(title) || "album";

  try {
    const { data, error } = await supabase
      .from(ALBUMS_TABLE)
      .select("id, slug")
      .like("slug", `${base}%`);

    if (error || !data) {
      return base;
    }

    const taken = new Set(
      data.filter((row) => row.id !== ignoreId).map((row) => (row.slug as string) || "")
    );

    if (!taken.has(base)) {
      return base;
    }

    let counter = 2;
    while (taken.has(`${base}-${counter}`)) {
      counter += 1;
    }
    return `${base}-${counter}`;
  } catch {
    return base;
  }
}

async function replaceAlbumTracks(albumId: string, songIds: string[]): Promise<void> {
  // 1. Try deleting from custom_album_tracks
  try {
    await supabase.from(TRACKS_TABLE).delete().eq("album_id", albumId);
  } catch {
    // ignore
  }

  // 2. Also try deleting from legacy album_songs if table exists
  try {
    await supabase.from(LEGACY_TRACKS_TABLE).delete().eq("album_id", albumId);
  } catch {
    // ignore
  }

  if (songIds.length === 0) return;

  const tracksRows = songIds.map((songId, index) => ({
    album_id: albumId,
    song_id: songId,
    track_order: index,
    position: index,
  }));

  // Insert into custom_album_tracks
  const { error: tracksError } = await supabase.from(TRACKS_TABLE).insert(tracksRows);

  if (tracksError) {
    // Fallback to legacy album_songs
    const legacyRows = songIds.map((songId, index) => ({
      album_id: albumId,
      song_id: songId,
      position: index,
    }));
    await supabase.from(LEGACY_TRACKS_TABLE).insert(legacyRows);
  }
}

/** All custom albums (admin view — includes drafts). */
export async function getCustomAlbums(collection?: string): Promise<CustomAlbum[]> {
  try {
    let query = supabase
      .from(ALBUMS_TABLE)
      .select(`
        *,
        custom_album_tracks ( song_id, track_order, position ),
        album_songs ( song_id, position )
      `)
      .order("created_at", { ascending: false });

    if (collection) {
      query = query.eq("collection", collection);
    }

    const { data, error } = await query;

    if (error) {
      // If table doesn't exist yet in Supabase schema cache, return empty array gracefully
      if (
        error.message?.includes("does not exist") ||
        error.message?.includes("schema cache") ||
        error.code === "42P01"
      ) {
        console.warn("[CustomAlbums] Table not found in database. Please run the migration SQL.");
        return [];
      }
      throw error;
    }

    return ((data ?? []) as unknown as RawAlbumRow[]).map(mapAlbumRow);
  } catch (err: any) {
    console.warn("Could not load custom albums:", err?.message || err);
    return [];
  }
}

/** Published custom albums only (public site). */
export async function getPublishedCustomAlbums(collection?: string): Promise<CustomAlbum[]> {
  try {
    let query = supabase
      .from(ALBUMS_TABLE)
      .select(`
        *,
        custom_album_tracks ( song_id, track_order, position ),
        album_songs ( song_id, position )
      `)
      .eq("published", true)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (collection) {
      query = query.eq("collection", collection);
    }

    const { data, error } = await query;

    if (error) {
      return [];
    }

    return ((data ?? []) as unknown as RawAlbumRow[]).map(mapAlbumRow);
  } catch (err) {
    console.error("Could not load published custom albums:", err);
    return [];
  }
}

export async function getPublishedCustomAlbumBySlug(slug: string): Promise<CustomAlbum | null> {
  try {
    const { data, error } = await supabase
      .from(ALBUMS_TABLE)
      .select(`
        *,
        custom_album_tracks ( song_id, track_order, position ),
        album_songs ( song_id, position )
      `)
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapAlbumRow(data as unknown as RawAlbumRow);
  } catch {
    return null;
  }
}

export async function createCustomAlbum(input: CustomAlbumInput): Promise<CustomAlbum> {
  const title = input.title.trim();
  if (!title) {
    throw new Error("Please enter an album title.");
  }

  const collection = input.collection ?? MAHI_EDITION_COLLECTION;
  const slug = await buildUniqueSlug(title);

  let cover: { publicUrl: string; path: string } | null = null;
  if (input.coverFile) {
    cover = await uploadCover(input.coverFile);
  }

  const payload: Record<string, any> = {
    title,
    slug,
    artist: input.artist?.trim() || null,
    description: input.description.trim() || null,
    type: input.type || "Custom Album",
    cover_image: cover?.publicUrl ?? null,
    cover_url: cover?.publicUrl ?? null,
    cover_path: cover?.path ?? null,
    release_date: input.releaseDate.trim() || null,
    published: input.published,
    collection,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(ALBUMS_TABLE)
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`Could not create custom album: ${error?.message ?? "unknown error"}`);
  }

  const album = mapAlbumRow(data as unknown as RawAlbumRow);
  await replaceAlbumTracks(album.id, input.songIds);

  return { ...album, songIds: input.songIds };
}

export async function updateCustomAlbum(albumId: string, input: CustomAlbumInput): Promise<void> {
  const title = input.title.trim();
  if (!title) {
    throw new Error("Please enter an album title.");
  }

  const slug = await buildUniqueSlug(title, albumId);

  const patch: Record<string, any> = {
    title,
    slug,
    artist: input.artist?.trim() || null,
    description: input.description.trim() || null,
    type: input.type || "Custom Album",
    release_date: input.releaseDate.trim() || null,
    published: input.published,
    updated_at: new Date().toISOString(),
  };

  if (input.coverFile) {
    const cover = await uploadCover(input.coverFile);
    patch.cover_image = cover.publicUrl;
    patch.cover_url = cover.publicUrl;
    patch.cover_path = cover.path;
  }

  const { error } = await supabase.from(ALBUMS_TABLE).update(patch).eq("id", albumId);

  if (error) {
    throw new Error(`Could not update album: ${error.message}`);
  }

  await replaceAlbumTracks(albumId, input.songIds);
}

export async function setCustomAlbumPublished(albumId: string, published: boolean): Promise<void> {
  const { error } = await supabase
    .from(ALBUMS_TABLE)
    .update({ published, updated_at: new Date().toISOString() })
    .eq("id", albumId);

  if (error) {
    throw new Error(`Could not change publish status: ${error.message}`);
  }
}

/** Deletes the custom album and its track associations. */
export async function deleteCustomAlbum(albumId: string): Promise<void> {
  const { data } = await supabase
    .from(ALBUMS_TABLE)
    .select("cover_path, cover_image, cover_url")
    .eq("id", albumId)
    .maybeSingle();

  const { error } = await supabase.from(ALBUMS_TABLE).delete().eq("id", albumId);

  if (error) {
    throw new Error(`Could not delete album: ${error.message}`);
  }

  const row = data as { cover_path?: string | null; cover_image?: string | null; cover_url?: string | null } | null;
  const coverPath = row?.cover_path || row?.cover_image || row?.cover_url;

  if (coverPath && coverPath.startsWith("http")) {
    // attempt B2 cleanup
    try {
      await deleteFileFromB2(coverPath);
    } catch {
      // ignore
    }
  }
}

/**
 * Auto Albums Helper: Updates album title for all songs matching old name or specific song IDs in database.
 */
export async function updateAutoAlbumName(
  oldAlbumName: string,
  newAlbumName: string,
  songIds?: string[]
): Promise<boolean> {
  const trimmedNew = newAlbumName.trim();
  if (!trimmedNew) throw new Error("Album name cannot be empty.");

  try {
    let query = supabase.from("songs").update({ album: trimmedNew });

    if (songIds && songIds.length > 0) {
      query = query.in("id", songIds);
    } else {
      query = query.ilike("album", oldAlbumName.trim());
    }

    const { error } = await query;
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.error("Failed to update auto album name:", err);
    throw new Error(`Could not rename album: ${err?.message || "unknown error"}`);
  }
}

/**
 * Auto Albums Helper: Dissociates album from songs (clears `album` field to null).
 */
export async function deleteAutoAlbum(albumName: string, songIds?: string[]): Promise<boolean> {
  try {
    let query = supabase.from("songs").update({ album: null });

    if (songIds && songIds.length > 0) {
      query = query.in("id", songIds);
    } else {
      query = query.ilike("album", albumName.trim());
    }

    const { error } = await query;
    if (error) throw error;
    return true;
  } catch (err: any) {
    console.error("Failed to delete auto album:", err);
    throw new Error(`Could not remove album: ${err?.message || "unknown error"}`);
  }
}

/**
 * Synchronizes all legacy album metadata from the `songs` table into `custom_albums` and `custom_album_tracks`.
 */
export async function syncLegacyAlbumsFromSongs(): Promise<{
  createdCount: number;
  syncedCount: number;
  totalTracks: number;
}> {
  try {
    // 1. Fetch all songs from database
    const { data: songsData, error: songsError } = await supabase
      .from("songs")
      .select("id, title, artist_name, artist:artist_name, album, cover_image, cover_url, created_at")
      .not("album", "is", null);

    if (songsError || !songsData) {
      throw new Error(`Failed to read songs for album sync: ${songsError?.message || "Unknown error"}`);
    }

    // 2. Group by album name
    const grouped = new Map<string, { albumTitle: string; songs: any[] }>();
    for (const s of songsData) {
      const albumTitle = (s.album || "").trim();
      if (!albumTitle) continue;
      const lower = albumTitle.toLowerCase();
      if (
        lower === "singles" ||
        lower === "single" ||
        lower === "unknown" ||
        lower === "unknown album" ||
        lower === "youtube"
      ) {
        continue;
      }

      if (!grouped.has(lower)) {
        grouped.set(lower, { albumTitle, songs: [] });
      }
      grouped.get(lower)!.songs.push(s);
    }

    if (grouped.size === 0) {
      return { createdCount: 0, syncedCount: 0, totalTracks: 0 };
    }

    // 3. Fetch existing custom albums
    const existingAlbums = await getCustomAlbums();
    const existingMap = new Map<string, CustomAlbum>();
    for (const a of existingAlbums) {
      existingMap.set(a.title.trim().toLowerCase(), a);
    }

    let createdCount = 0;
    let syncedCount = 0;
    let totalTracks = 0;

    for (const [lowerTitle, group] of grouped.entries()) {
      const songIds = group.songs.map((s) => s.id);
      totalTracks += songIds.length;
      const firstSong = group.songs[0];
      const artist = firstSong?.artist || firstSong?.artist_name || "Munem Mahi";
      const cover = firstSong?.cover_image || firstSong?.cover_url || null;

      if (!existingMap.has(lowerTitle)) {
        // Create new custom album
        const slug = await buildUniqueSlug(group.albumTitle);
        const { data: newAlbum, error: createError } = await supabase
          .from(ALBUMS_TABLE)
          .insert({
            title: group.albumTitle,
            slug,
            artist,
            cover_image: cover,
            cover_url: cover,
            type: songIds.length >= 6 ? "Studio Album" : "Artist EP",
            published: true,
            collection: MAHI_EDITION_COLLECTION,
          })
          .select("id")
          .single();

        if (!createError && newAlbum?.id) {
          await replaceAlbumTracks(newAlbum.id, songIds);
          createdCount += 1;
        }
      } else {
        // Update existing custom album tracks
        const existing = existingMap.get(lowerTitle)!;
        await replaceAlbumTracks(existing.id, songIds);
        syncedCount += 1;
      }
    }

    return { createdCount, syncedCount, totalTracks };
  } catch (err: any) {
    console.error("Error in syncLegacyAlbumsFromSongs:", err);
    throw err;
  }
}
