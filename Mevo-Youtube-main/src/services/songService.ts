import {
  type B2UploadResult,
  deleteFileFromB2,
  uploadAudioToB2,
  uploadCoverToB2,
} from "@/lib/b2-storage";
import { supabase } from "@/lib/supabase";

const SONGS_TABLE = "songs";

const SONG_SELECT_COLUMNS = `
  id,
  title,
  artist:artist_name,
  album,
  genre,
  section,
  duration,
  cover_image,
  audio_file,
  release_date,
  play_count,
  published,
  track_number,
  disc_number,
  original_filename,
  audio_mime,
  audio_size,
  audio_hash,
  audio_path,
  cover_path,
  created_at,
  updated_at
`;

export const SONG_SECTION_OPTIONS = [
  { value: "bangla-beats", label: "Bengal Echo" },
  { value: "mahis-favourite", label: "Mahi Select" },
  { value: "soft-hindi-vibes", label: "Hindi Reverie" },
  { value: "english-essence", label: "English Essence" },
  { value: "global-tracks", label: "Sonic World" },
  { value: "boost-aura", label: "Boost Aura" },
] as const;

export type SongSection = (typeof SONG_SECTION_OPTIONS)[number]["value"];

const DEFAULT_SONG_SECTION: SongSection = "bangla-beats";
const VALID_SONG_SECTIONS = new Set<string>(SONG_SECTION_OPTIONS.map((option) => option.value));

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  section: SongSection;
  duration: number;
  cover_image: string | null;
  audio_file: string;
  release_date: string | null;
  play_count: number;
  published: boolean;
  track_number: number | null;
  disc_number: number | null;
  original_filename: string | null;
  audio_mime: string | null;
  audio_size: number | null;
  audio_hash: string | null;
  audio_path: string | null;
  cover_path: string | null;
  created_at: string;
  updated_at: string;
}

type DurationInput = number | string | null;
type SongSectionInput = SongSection | string | null;

/** Progress stages reported by the upload pipeline. */
export type UploadStage = "uploading-audio" | "uploading-cover" | "saving-song";

export interface CreateSongInput {
  title: string;
  artist: string;
  album?: string | null;
  genre?: string | null;
  section?: SongSectionInput;
  duration?: DurationInput;
  releaseDate?: string | null;
  published?: boolean;
  audioFile: File;
  coverFile?: File | null;
  trackNumber?: number | null;
  discNumber?: number | null;
  originalFileName?: string | null;
  audioHash?: string | null;
  onStage?: (stage: UploadStage) => void;
}

export interface UpdateSongInput {
  title?: string;
  artist?: string;
  album?: string | null;
  genre?: string | null;
  section?: SongSectionInput;
  duration?: number | string;
  releaseDate?: string | null;
  published?: boolean;
  trackNumber?: number | null;
  discNumber?: number | null;
}

interface SupabaseLikeError {
  message?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const supabaseError = error as SupabaseLikeError;
    const parts = [
      supabaseError.message,
      supabaseError.details,
      supabaseError.hint,
      supabaseError.code ? `Code: ${String(supabaseError.code)}` : null,
    ]
      .filter(
        (value): value is string | number | boolean =>
          value !== null && value !== undefined && String(value).trim().length > 0,
      )
      .map(String);

    if (parts.length > 0) {
      return [...new Set(parts)].join(" | ");
    }

    try {
      return JSON.stringify(error);
    } catch {
      return "Unknown error";
    }
  }

  return String(error || "Unknown error");
}

function throwServiceError(prefix: string, error: unknown): never {
  const message = getErrorMessage(error);
  console.error(prefix, error);
  throw new Error(`${prefix}: ${message}`);
}

function normalizeArtistName(value: string): string {
  const normalized = value
    .replace(/^[\s,_]+|[\s,_]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) {
    throw new Error("Artist name is required.");
  }

  return normalized;
}

function normalizeDuration(value: DurationInput | undefined, fallback = 0): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Duration must be a non-negative number.");
    }

    return Math.round(value);
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return fallback;
  }

  if (/^\d+(?:\.\d+)?$/.test(trimmedValue)) {
    return Math.round(Number(trimmedValue));
  }

  const timeParts = trimmedValue.split(":");

  if (
    timeParts.length < 2 ||
    timeParts.length > 3 ||
    timeParts.some((part) => !/^\d+$/.test(part))
  ) {
    throw new Error('Invalid duration. Use seconds, "4:30", or "1:04:30".');
  }

  const numbers = timeParts.map(Number);

  if (numbers.length === 2) {
    const [minutes, seconds] = numbers;

    if (seconds >= 60) {
      throw new Error("Duration seconds must be less than 60.");
    }

    return minutes * 60 + seconds;
  }

  const [hours, minutes, seconds] = numbers;

  if (minutes >= 60 || seconds >= 60) {
    throw new Error("Duration minutes and seconds must be less than 60.");
  }

  return hours * 3600 + minutes * 60 + seconds;
}

function normalizeSongSection(
  value: SongSectionInput | undefined,
  fallback: SongSection = DEFAULT_SONG_SECTION,
): SongSection {
  if (value === undefined || value === null || value.trim() === "") {
    return fallback;
  }

  const normalizedValue = value.trim().toLowerCase();

  if (!VALID_SONG_SECTIONS.has(normalizedValue)) {
    throw new Error(
      `Invalid song section: ${value}. Please choose a section from the upload form.`,
    );
  }

  return normalizedValue as SongSection;
}

function normalizeReleaseDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    throw new Error("Release date must use YYYY-MM-DD format.");
  }

  const parsedDate = new Date(`${trimmedValue}T00:00:00Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== trimmedValue
  ) {
    throw new Error("Release date is not valid.");
  }

  return trimmedValue;
}

function sanitizeFileName(fileName: string): string {
  const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, "");

  return (
    nameWithoutExtension
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "file"
  );
}

function getFileExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() || "bin";
}

function createStoragePath(file: File): string {
  const dateFolder = new Date().toISOString().slice(0, 10);
  const uniqueId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const safeName = sanitizeFileName(file.name);
  const extension = getFileExtension(file.name);

  return `${dateFolder}/${uniqueId}-${safeName}.${extension}`;
}

function validateAudioFile(file: File): void {
  if (!(file instanceof File)) {
    throw new Error("Please select an audio file.");
  }

  const validMimeTypes = [
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
  ];

  const validExtension = /\.(mp3|m4a|wav)$/i.test(file.name);
  const validMimeType = validMimeTypes.includes(file.type);

  if (!validMimeType && !validExtension) {
    throw new Error("Please select a valid MP3, M4A, or WAV audio file.");
  }

  const maximumSize = 50 * 1024 * 1024;

  if (file.size <= 0) {
    throw new Error("The selected audio file is empty.");
  }

  if (file.size > maximumSize) {
    throw new Error("Audio file must be 50 MB or smaller.");
  }
}

function validateCoverFile(file: File): void {
  if (!(file instanceof File)) {
    throw new Error("Please select a cover image.");
  }

  const validMimeTypes = ["image/jpeg", "image/png", "image/webp"];
  const validExtension = /\.(jpe?g|png|webp)$/i.test(file.name);
  const validMimeType = validMimeTypes.includes(file.type);

  if (!validMimeType && !validExtension) {
    throw new Error("Cover image must be a JPG, PNG, or WebP file.");
  }

  const maximumSize = 5 * 1024 * 1024;

  if (file.size <= 0) {
    throw new Error("The selected cover image is empty.");
  }

  if (file.size > maximumSize) {
    throw new Error("Cover image must be 5 MB or smaller.");
  }
}

export function isUuid(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

export function validateSongId(songId: string): string {
  const normalizedId = songId?.trim();

  if (!normalizedId) {
    throw new Error("Song ID is required.");
  }

  if (!isUuid(normalizedId)) {
    throw new Error(`Invalid song UUID: "${normalizedId}". Expected standard UUID.`);
  }

  return normalizedId;
}

export async function getSongs(): Promise<Song[]> {
  const { data, error } = await supabase
    .from(SONGS_TABLE)
    .select(SONG_SELECT_COLUMNS)
    .eq("published", true)
    .order("created_at", { ascending: true });

  if (error) {
    throwServiceError("Could not load songs", error);
  }

  return (data ?? []) as Song[];
}

export async function getAllSongs(): Promise<Song[]> {
  const { data, error } = await supabase
    .from(SONGS_TABLE)
    .select(SONG_SELECT_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    throwServiceError("Could not load all songs", error);
  }

  return (data ?? []) as Song[];
}

export async function getSongById(songId: string): Promise<Song> {
  const id = validateSongId(songId);

  const { data, error } = await supabase
    .from(SONGS_TABLE)
    .select(SONG_SELECT_COLUMNS)
    .eq("id", id)
    .single();

  if (error) {
    throwServiceError("Could not load song", error);
  }

  if (!data) {
    throw new Error("Could not load song: Song was not found.");
  }

  return data as Song;
}

/** Public lookup: returns only a published song, or null when unavailable or invalid UUID. */
export async function getPublishedSongById(songId: string): Promise<Song | null> {
  const normalizedId = songId?.trim();
  if (!normalizedId || !isUuid(normalizedId)) {
    return null;
  }

  const { data, error } = await supabase
    .from(SONGS_TABLE)
    .select(SONG_SELECT_COLUMNS)
    .eq("id", normalizedId)
    .eq("published", true)
    .maybeSingle();

  if (error) {
    throwServiceError("Could not load published song", error);
  }

  return (data as Song | null) ?? null;
}

export async function searchSongs(query: string, limit = 6): Promise<Song[]> {
  const searchTerm = query
    .trim()
    .replace(/[,%()"'\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!searchTerm) {
    return getSongs();
  }

  const { data, error } = await supabase
    .from(SONGS_TABLE)
    .select(SONG_SELECT_COLUMNS)
    .eq("published", true)
    .or(
      [
        `title.ilike.%${searchTerm}%`,
        `artist_name.ilike.%${searchTerm}%`,
        `album.ilike.%${searchTerm}%`,
        `genre.ilike.%${searchTerm}%`,
      ].join(","),
    )
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(50, Math.trunc(limit) || 6)));

  if (error) {
    throwServiceError("Could not search songs", error);
  }

  return (data ?? []) as Song[];
}

export async function createSong(input: CreateSongInput): Promise<Song> {
  const title = input.title.trim();
  const artist = normalizeArtistName(input.artist);

  if (!title) {
    throw new Error("Song title is required.");
  }

  if (!artist) {
    throw new Error("Artist name is required.");
  }

  validateAudioFile(input.audioFile);

  if (input.coverFile) {
    validateCoverFile(input.coverFile);
  }

  const duration = normalizeDuration(input.duration, 0);
  const section = normalizeSongSection(input.section);
  const releaseDate = normalizeReleaseDate(input.releaseDate);

  let uploadedAudio: B2UploadResult | null = null;
  let uploadedCover: B2UploadResult | null = null;

  try {
    input.onStage?.("uploading-audio");
    uploadedAudio = await uploadAudioToB2(input.audioFile);

    if (input.coverFile) {
      input.onStage?.("uploading-cover");
      uploadedCover = await uploadCoverToB2(input.coverFile);
    }

    input.onStage?.("saving-song");

    const insertPayload = {
      title,
      artist_name: artist,
      album: input.album?.trim() || null,
      genre: input.genre?.trim() || null,
      section,
      duration,
      cover_image: uploadedCover?.publicUrl ?? null,
      audio_file: uploadedAudio.publicUrl,
      release_date: releaseDate,
      play_count: 0,
      published: input.published ?? true,
      track_number: input.trackNumber ?? null,
      disc_number: input.discNumber ?? null,
      original_filename: input.originalFileName?.trim() || input.audioFile.name,
      audio_mime: input.audioFile.type || null,
      audio_size: input.audioFile.size,
      audio_hash: input.audioHash ?? null,
      audio_path: uploadedAudio.key,
      cover_path: uploadedCover?.key ?? null,
    };

    console.log("Insert Object:", insertPayload);

    const { data, error } = await supabase
      .from(SONGS_TABLE)
      .insert(insertPayload)
      .select(SONG_SELECT_COLUMNS)
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error("Supabase did not return the created song.");
    }

    return data as Song;
  } catch (error) {
    await Promise.allSettled([
      deleteFileFromB2(uploadedAudio?.key),
      deleteFileFromB2(uploadedCover?.key),
    ]);

    throwServiceError("Could not create song", error);
  }
}

export async function updateSong(songId: string, input: UpdateSongInput): Promise<Song> {
  const id = validateSongId(songId);

  const updates: Partial<{
    title: string;
    artist_name: string;
    album: string | null;
    genre: string | null;
    section: SongSection;
    duration: number;
    release_date: string | null;
    published: boolean;
    track_number: number | null;
    disc_number: number | null;
  }> = {};

  if (input.title !== undefined) {
    const title = input.title.trim();

    if (!title) {
      throw new Error("Song title cannot be empty.");
    }

    updates.title = title;
  }

  if (input.artist !== undefined) {
    updates.artist_name = normalizeArtistName(input.artist);
  }

  if (input.album !== undefined) {
    updates.album = input.album?.trim() || null;
  }

  if (input.genre !== undefined) {
    updates.genre = input.genre?.trim() || null;
  }

  if (input.section !== undefined) {
    updates.section = normalizeSongSection(input.section);
  }

  if (input.duration !== undefined) {
    updates.duration = normalizeDuration(input.duration);
  }

  if (input.releaseDate !== undefined) {
    updates.release_date = normalizeReleaseDate(input.releaseDate);
  }

  if (input.published !== undefined) {
    updates.published = input.published;
  }

  if (input.trackNumber !== undefined) {
    const value = Number(input.trackNumber);
    updates.track_number = Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
  }

  if (input.discNumber !== undefined) {
    const value = Number(input.discNumber);
    updates.disc_number = Number.isFinite(value) && value > 0 ? Math.trunc(value) : null;
  }

  if (Object.keys(updates).length === 0) {
    return getSongById(id);
  }

  const { data, error } = await supabase
    .from(SONGS_TABLE)
    .update(updates)
    .eq("id", id)
    .select(SONG_SELECT_COLUMNS)
    .single();

  if (error) {
    throwServiceError("Could not update song", error);
  }

  if (!data) {
    throw new Error("Could not update song: Song was not found.");
  }

  return data as Song;
}

/**
 * Safe cover replacement.
 *
 * The new cover is uploaded and the row is updated first; the previous cover
 * object is only removed afterwards, and only when no other song still uses it.
 */
export async function replaceSongCover(songId: string, coverFile: File): Promise<Song> {
  const id = validateSongId(songId);
  validateCoverFile(coverFile);

  const currentSong = await getSongById(id);
  let uploadedCover: B2UploadResult | null = null;

  try {
    uploadedCover = await uploadCoverToB2(coverFile);

    const { data, error } = await supabase
      .from(SONGS_TABLE)
      .update({
        cover_image: uploadedCover.publicUrl,
        cover_path: uploadedCover.key,
      })
      .eq("id", id)
      .select(SONG_SELECT_COLUMNS)
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error("Supabase did not return the updated song.");
    }

    if (await isCoverSafeToDelete(currentSong.cover_image, id)) {
      await deleteFileFromB2(currentSong.cover_path || currentSong.cover_image);
    }

    return data as Song;
  } catch (error) {
    await deleteFileFromB2(uploadedCover?.key);

    throwServiceError("Could not replace cover", error);
  }
}

export interface ReplaceAudioOptions {
  duration?: number | string;
  originalFileName?: string | null;
  audioHash?: string | null;
  onStage?: (stage: UploadStage) => void;
}

/**
 * Safe audio replacement.
 *
 * Sequence: validate -> upload new audio -> update the existing row ->
 * verify the new URL -> only then delete the previous audio object.
 * The song ID, play count, ranking data, Trending relation and album stay
 * exactly as they were.
 */
export async function replaceSongAudio(
  songId: string,
  audioFile: File,
  options: ReplaceAudioOptions | number | string = {},
): Promise<Song> {
  const id = validateSongId(songId);
  validateAudioFile(audioFile);

  const normalizedOptions: ReplaceAudioOptions =
    typeof options === "object" && options !== null ? options : { duration: options };

  const currentSong = await getSongById(id);
  const normalizedDuration =
    normalizedOptions.duration === undefined
      ? currentSong.duration
      : normalizeDuration(normalizedOptions.duration, currentSong.duration);

  let uploadedAudio: B2UploadResult | null = null;

  try {
    normalizedOptions.onStage?.("uploading-audio");
    uploadedAudio = await uploadAudioToB2(audioFile);

    normalizedOptions.onStage?.("saving-song");

    const { data, error } = await supabase
      .from(SONGS_TABLE)
      .update({
        audio_file: uploadedAudio.publicUrl,
        audio_path: uploadedAudio.key,
        audio_mime: audioFile.type || null,
        audio_size: audioFile.size,
        audio_hash: normalizedOptions.audioHash ?? null,
        original_filename: normalizedOptions.originalFileName?.trim() || audioFile.name,
        duration: normalizedDuration,
      })
      .eq("id", id)
      .select(SONG_SELECT_COLUMNS)
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error("Supabase did not return the updated song.");
    }

    // Only remove the previous object once the new one is confirmed live.
    if (currentSong.audio_file && currentSong.audio_file !== uploadedAudio.publicUrl) {
      await deleteFileFromB2(currentSong.audio_path || currentSong.audio_file);
    }

    return data as Song;
  } catch (error) {
    await deleteFileFromB2(uploadedAudio?.key);

    throwServiceError("Could not replace audio", error);
  }
}

export async function incrementPlayCount(songId: string): Promise<void> {
  const id = validateSongId(songId);
  const song = await getSongById(id);
  const currentPlayCount = Number.isFinite(song.play_count) ? Math.max(0, song.play_count) : 0;

  const { error } = await supabase
    .from(SONGS_TABLE)
    .update({ play_count: currentPlayCount + 1 })
    .eq("id", id);

  if (error) {
    console.error(`Could not update play count: ${getErrorMessage(error)}`, error);
  }
}

/**
 * A cover may be shared by several songs (same album artwork).
 * It is only safe to delete when no other song references the same URL.
 */
export async function isCoverSafeToDelete(
  coverUrl: string | null,
  excludeSongId: string,
): Promise<boolean> {
  if (!coverUrl) {
    return false;
  }

  const { data, error } = await supabase
    .from(SONGS_TABLE)
    .select("id")
    .eq("cover_image", coverUrl)
    .neq("id", excludeSongId)
    .limit(1);

  if (error) {
    console.error("Could not check shared cover usage:", error);
    return false;
  }

  return (data ?? []).length === 0;
}

export interface DeleteSongReport {
  audioRemoved: boolean;
  coverRemoved: boolean;
  coverShared: boolean;
  orphanFiles: string[];
}

export async function deleteSong(songId: string): Promise<DeleteSongReport> {
  const id = validateSongId(songId);
  const song = await getSongById(id);
  const coverSafe = await isCoverSafeToDelete(song.cover_image, id);

  // Trending relation first so no dangling selection remains.
  await supabase.from(TRENDING_SONGS_TABLE).delete().eq("song_id", id);

  const { error } = await supabase.from(SONGS_TABLE).delete().eq("id", id);

  if (error) {
    throwServiceError("Could not delete song", error);
  }

  const orphanFiles: string[] = [];
  let audioRemoved = false;
  let coverRemoved = false;

  try {
    await deleteFileFromB2(song.audio_path || song.audio_file);
    audioRemoved = true;
  } catch (removeError) {
    console.error("Audio cleanup failed:", removeError);
    orphanFiles.push(song.audio_path ?? song.audio_file);
  }

  if (coverSafe && song.cover_image) {
    try {
      await deleteFileFromB2(song.cover_path || song.cover_image);
      coverRemoved = true;
    } catch (removeError) {
      console.error("Cover cleanup failed:", removeError);
      orphanFiles.push(song.cover_path ?? song.cover_image);
    }
  }

  return {
    audioRemoved,
    coverRemoved,
    coverShared: Boolean(song.cover_image) && !coverSafe,
    orphanFiles,
  };
}

// =====================================================
// TRENDING SONGS
// =====================================================

const TRENDING_SONGS_TABLE = "trending_songs";

export interface TrendingSong extends Song {
  display_order: number | null;
  trending_added_at: string;
}

export interface TrendingOrderItem {
  song_id: string;
  display_order: number;
}

/**
 * Loads only songs that were manually added to the Trending section.
 * The original song row remains in the songs table.
 */
export async function getTrendingSongs(): Promise<TrendingSong[]> {
  // First load only the manually selected Trending relationships.
  // This avoids relying on PostgREST relationship/schema-cache resolution.
  const { data: relationData, error: relationError } = await supabase
    .from(TRENDING_SONGS_TABLE)
    .select("song_id, display_order, created_at")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (relationError) {
    throwServiceError("Could not load Trending relationships", relationError);
  }

  const relationRows = (relationData ?? []) as Array<{
    song_id: string;
    display_order: number | null;
    created_at: string;
  }>;

  if (relationRows.length === 0) {
    return [];
  }

  const songIds = relationRows.map((row) => row.song_id);

  // Then load the original song rows without creating duplicate song data.
  const { data: songData, error: songError } = await supabase
    .from(SONGS_TABLE)
    .select(SONG_SELECT_COLUMNS)
    .in("id", songIds)
    .eq("published", true);

  if (songError) {
    throwServiceError("Could not load songs selected for Trending", songError);
  }

  const songsById = new Map(((songData ?? []) as Song[]).map((song) => [song.id, song]));

  // Preserve the manual display order stored in trending_songs.
  return relationRows.flatMap((row) => {
    const song = songsById.get(row.song_id);

    if (!song) {
      return [];
    }

    return [
      {
        ...song,
        display_order: row.display_order,
        trending_added_at: row.created_at,
      },
    ];
  });
}

/**
 * Returns the IDs used by the Admin Panel to show the correct button state.
 */
export async function getTrendingSongIds(): Promise<string[]> {
  const { data, error } = await supabase.from(TRENDING_SONGS_TABLE).select("song_id");

  if (error) {
    throwServiceError("Could not load Trending song IDs", error);
  }

  return (data ?? []).map((row) => String(row.song_id));
}

/**
 * Adds an existing song to Trending without creating a duplicate song row.
 */
export async function addSongToTrending(
  songId: string,
  customPosition?: number | null,
): Promise<void> {
  const id = validateSongId(songId);

  const { data: existingRow, error: existingError } = await supabase
    .from(TRENDING_SONGS_TABLE)
    .select("song_id")
    .eq("song_id", id)
    .maybeSingle();

  if (existingError) {
    throwServiceError("Could not check Trending status", existingError);
  }

  if (existingRow) {
    return;
  }

  const { data: lastRow, error: orderError } = await supabase
    .from(TRENDING_SONGS_TABLE)
    .select("display_order")
    .not("display_order", "is", null)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderError) {
    throwServiceError("Could not determine Trending order", orderError);
  }

  const currentMaximum = Number(lastRow?.display_order ?? 0);
  const nextDisplayOrder = Number.isFinite(currentMaximum) ? Math.max(0, currentMaximum) + 1 : 1;

  // A custom position is used as-is; existing manual ordering is never
  // silently rewritten.
  const requestedPosition = Number(customPosition);
  const displayOrder =
    Number.isInteger(requestedPosition) && requestedPosition > 0
      ? requestedPosition
      : nextDisplayOrder;

  const { error } = await supabase.from(TRENDING_SONGS_TABLE).upsert(
    {
      song_id: id,
      display_order: displayOrder,
    },
    {
      onConflict: "song_id",
      ignoreDuplicates: true,
    },
  );

  if (error) {
    throwServiceError("Could not add song to Trending", error);
  }
}

/**
 * Removes only the Trending relationship.
 * It never deletes the original song or its Storage files.
 */
export async function removeSongFromTrending(songId: string): Promise<void> {
  const id = validateSongId(songId);

  const { error } = await supabase.from(TRENDING_SONGS_TABLE).delete().eq("song_id", id);

  if (error) {
    throwServiceError("Could not remove song from Trending", error);
  }
}

/**
 * Optional helper for numeric ordering or drag-and-drop ordering in Admin.
 */
export async function updateTrendingOrder(items: TrendingOrderItem[]): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const normalizedItems = items.map((item) => {
    const songId = validateSongId(item.song_id);
    const displayOrder = Number(item.display_order);

    if (!Number.isInteger(displayOrder) || displayOrder < 1) {
      throw new Error("Trending display order must be a positive integer.");
    }

    return {
      song_id: songId,
      display_order: displayOrder,
    };
  });

  const results = await Promise.all(
    normalizedItems.map((item) =>
      supabase
        .from(TRENDING_SONGS_TABLE)
        .update({ display_order: item.display_order })
        .eq("song_id", item.song_id),
    ),
  );

  const failedResult = results.find((result) => result.error);

  if (failedResult?.error) {
    throwServiceError("Could not update Trending order", failedResult.error);
  }
}
