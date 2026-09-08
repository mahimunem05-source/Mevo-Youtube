/**
 * Audio Importer Service
 * Handles downloading YouTube audio via local extractor microservice,
 * processing files, uploading to Backblaze B2, and saving to Supabase.
 */

import {
  downloadYouTubeAudio,
  extractYouTubeVideoId,
  getVideoInfo,
  type ExtractorVideoInfo,
} from "@/lib/extractor";
import {
  type B2UploadResult,
  deleteFileFromB2,
  uploadAudioToB2,
  uploadCoverToB2,
} from "@/lib/b2-storage";
import { supabase } from "@/lib/supabase";
import type { Song, SongSection } from "@/services/songService";

export interface YouTubeTrackInput {
  /** 11-char YouTube ID or full YouTube URL */
  id: string;
  title: string;
  /** Artist / Channel name */
  artist?: string;
  channel?: string;
  album?: string | null;
  genre?: string | null;
  section?: SongSection;
  thumbnail?: string | null;
  duration?: number | null;
  quality?: "fast" | "128";
}

export type ImportStage =
  | "fetching-info"
  | "extracting-audio"
  | "processing-files"
  | "uploading-audio"
  | "uploading-cover"
  | "saving-database"
  | "completed";

export interface ImportProgressCallback {
  (stage: ImportStage, details?: { message?: string; percent?: number }): void;
}

export interface ImportYouTubeOptions {
  onProgress?: ImportProgressCallback;
  quality?: "fast" | "128";
}

export interface ImportResult {
  song: Song;
  videoInfo?: ExtractorVideoInfo;
  audioKey?: string;
  coverKey?: string;
}

/**
 * Cleans string for safe filenames
 */
function sanitizeFileName(name: string): string {
  return name
    .replace(/[^\w\s.-]/gi, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 100) || "track";
}

/**
 * Downloads an image URL as a File object (fallback gracefully on CORS issues)
 */
async function fetchImageAsFile(imageUrl: string, filename: string): Promise<File | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size === 0) return null;
    return new File([blob], `${sanitizeFileName(filename)}.jpg`, {
      type: blob.type || "image/jpeg",
    });
  } catch (error) {
    console.warn("Could not convert image URL to File (CORS or network):", error);
    return null;
  }
}

/**
 * Imports a YouTube track:
 * 1. Fetches metadata if needed
 * 2. Downloads audio via extractor microservice
 * 3. Converts blob into a File
 * 4. Uploads audio and cover image to Backblaze B2
 * 5. Creates record in Supabase `songs` table
 */
export async function importYouTubeTrack(
  video: YouTubeTrackInput,
  options: ImportYouTubeOptions = {}
): Promise<ImportResult> {
  const { onProgress, quality = "fast" } = options;
  const videoId = extractYouTubeVideoId(video.id);

  if (!videoId) {
    throw new Error("Invalid YouTube video ID or URL provided.");
  }

  // 1. Fetch metadata if duration or title is missing
  let title = (video.title || "").trim();
  let artist = (video.artist || video.channel || "").trim();
  let duration = video.duration || 0;
  let thumbnail = video.thumbnail || null;
  let fetchedInfo: ExtractorVideoInfo | undefined;

  if (!title || !duration || !artist || !thumbnail) {
    onProgress?.("fetching-info", { message: "Fetching video metadata..." });
    try {
      fetchedInfo = await getVideoInfo(videoId);
      if (!title) title = fetchedInfo.title;
      if (!artist) artist = fetchedInfo.uploader || "YouTube Artist";
      if (!duration && fetchedInfo.duration) duration = fetchedInfo.duration;
      if (!thumbnail && fetchedInfo.thumbnail) thumbnail = fetchedInfo.thumbnail;
    } catch (e) {
      console.warn("Could not fetch remote video info, continuing with provided data:", e);
      if (!title) title = `YouTube Track ${videoId}`;
      if (!artist) artist = "YouTube";
    }
  }

  // 2. Download audio blob via Python microservice
  onProgress?.("extracting-audio", {
    message: "Extracting and encoding audio with Python microservice...",
  });
  const audioBlob = await downloadYouTubeAudio(videoId, quality);

  // 3. Process into File object
  onProgress?.("processing-files", { message: "Preparing audio and cover files..." });
  const cleanTitle = sanitizeFileName(title);
  const audioFile = new File([audioBlob], `${cleanTitle}.mp3`, {
    type: "audio/mpeg",
  });

  // Attempt to prepare cover image file from thumbnail
  let coverFile: File | null = null;
  if (thumbnail) {
    coverFile = await fetchImageAsFile(thumbnail, `${cleanTitle}-cover`);
  }

  let uploadedAudio: B2UploadResult | null = null;
  let uploadedCover: B2UploadResult | null = null;

  try {
    // 4. Upload audio to Backblaze B2
    onProgress?.("uploading-audio", { message: "Uploading audio to Backblaze B2 storage..." });
    uploadedAudio = await uploadAudioToB2(audioFile);

    // Upload cover to Backblaze B2 if File was created
    if (coverFile) {
      onProgress?.("uploading-cover", { message: "Uploading cover artwork to storage..." });
      try {
        uploadedCover = await uploadCoverToB2(coverFile);
      } catch (covErr) {
        console.warn("Cover upload to B2 failed, using direct thumbnail URL:", covErr);
      }
    }

    // 5. Save record to Supabase database
    onProgress?.("saving-database", { message: "Registering track in Mevo database..." });

    const coverImageUrl = uploadedCover?.publicUrl || thumbnail || null;
    const section: SongSection = video.section || "global-tracks";

    const insertPayload = {
      title,
      artist_name: artist,
      album: video.album?.trim() || null,
      genre: video.genre?.trim() || "Imported",
      section,
      duration: Math.round(duration || 0),
      cover_image: coverImageUrl,
      audio_file: uploadedAudio.publicUrl,
      release_date: new Date().toISOString().slice(0, 10),
      play_count: 0,
      published: true,
      original_filename: `yt-${videoId}-${cleanTitle}.mp3`,
      audio_mime: "audio/mpeg",
      audio_size: audioFile.size,
      audio_path: uploadedAudio.key,
      cover_path: uploadedCover?.key ?? null,
    };

    const { data, error } = await supabase
      .from("songs")
      .insert(insertPayload)
      .select(`
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
      `)
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error("Supabase did not return the imported song record.");
    }

    onProgress?.("completed", { message: "Song successfully imported!" });

    return {
      song: data as Song,
      videoInfo: fetchedInfo,
      audioKey: uploadedAudio.key,
      coverKey: uploadedCover?.key,
    };
  } catch (error) {
    // Rollback uploaded B2 assets if database insertion failed
    if (uploadedAudio?.key || uploadedCover?.key) {
      await Promise.allSettled([
        deleteFileFromB2(uploadedAudio?.key),
        deleteFileFromB2(uploadedCover?.key),
      ]);
    }

    console.error("Audio import error:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to complete YouTube track import."
    );
  }
}
