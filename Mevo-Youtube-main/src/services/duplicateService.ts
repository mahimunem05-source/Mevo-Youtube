import { supabase } from "@/lib/supabase";
import type { Song } from "@/services/songService";

/**
 * Duplicate protection for the MEVO Smart Upload system.
 *
 * Nothing here blocks an upload automatically — it surfaces a warning plus
 * the matching song so the admin can decide (open, replace, skip, or upload
 * as a separate song anyway).
 */

const SONGS_TABLE = "songs";

const SONG_COLUMNS = `
  id, title, artist:artist_name, album, genre, section, duration,
  cover_image, audio_file, release_date, play_count, published,
  track_number, disc_number, original_filename, audio_mime, audio_size,
  audio_hash, audio_path, cover_path, created_at, updated_at
`;

export type DuplicateReason = "identical-file" | "same-filename-and-size" | "same-title-and-artist";

export interface DuplicateMatch {
  song: Song;
  reason: DuplicateReason;
  confidence: "high" | "medium";
  message: string;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export interface DuplicateCheckInput {
  title: string;
  artist: string;
  album?: string | null;
  originalFileName?: string | null;
  fileSize?: number | null;
  audioHash?: string | null;
}

export async function findPossibleDuplicate(
  input: DuplicateCheckInput,
): Promise<DuplicateMatch | null> {
  // 1. Exact content match (strongest signal).
  if (input.audioHash) {
    const { data } = await supabase
      .from(SONGS_TABLE)
      .select(SONG_COLUMNS)
      .eq("audio_hash", input.audioHash)
      .limit(1);

    const song = (data ?? [])[0] as Song | undefined;

    if (song) {
      return {
        song,
        reason: "identical-file",
        confidence: "high",
        message: "This exact audio file already exists in MEVO.",
      };
    }
  }

  // 2. Same original filename and byte size.
  if (input.originalFileName && input.fileSize) {
    const { data } = await supabase
      .from(SONGS_TABLE)
      .select(SONG_COLUMNS)
      .eq("original_filename", input.originalFileName)
      .eq("audio_size", input.fileSize)
      .limit(1);

    const song = (data ?? [])[0] as Song | undefined;

    if (song) {
      return {
        song,
        reason: "same-filename-and-size",
        confidence: "high",
        message: "The same audio file name and size already exists.",
      };
    }
  }

  // 3. Normalised title + artist (+ album when present).
  const title = normalizeText(input.title);
  const artist = normalizeText(input.artist);

  if (!title || !artist) {
    return null;
  }

  const { data } = await supabase
    .from(SONGS_TABLE)
    .select(SONG_COLUMNS)
    .ilike("title", title)
    .limit(20);

  const candidates = (data ?? []) as Song[];

  const match = candidates.find(
    (song) => normalizeText(song.title) === title && normalizeText(song.artist) === artist,
  );

  if (match) {
    return {
      song: match,
      reason: "same-title-and-artist",
      confidence: "medium",
      message: "A similar song already exists.",
    };
  }

  return null;
}
