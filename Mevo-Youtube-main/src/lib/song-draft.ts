import { computeFileHash, parseAudioMetadata, type AudioMetadata } from "@/lib/audio-metadata";

import { prepareCoverImage } from "@/lib/cover-image";

import { resolveAlbum, type AlbumResolution } from "@/services/albumService";

import { findPossibleDuplicate, type DuplicateMatch } from "@/services/duplicateService";

import { addSongToTrending, createSong, type Song, type SongSection } from "@/services/songService";

/** Every status a draft can display in Quick Upload and Batch Upload. */
export type DraftStatus =
  | "waiting"
  | "reading-metadata"
  | "metadata-detected"
  | "cover-required"
  | "ready"
  | "uploading-audio"
  | "uploading-cover"
  | "saving-song"
  | "linking-album"
  | "adding-trending"
  | "published"
  | "published-with-warning"
  | "failed";

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  waiting: "Waiting",
  "reading-metadata": "Reading metadata",
  "metadata-detected": "Metadata detected",
  "cover-required": "Cover required",
  ready: "Ready to publish",
  "uploading-audio": "Uploading audio",
  "uploading-cover": "Uploading cover",
  "saving-song": "Saving song",
  "linking-album": "Linking album",
  "adding-trending": "Adding to Trending",
  published: "Published",
  "published-with-warning": "Published with warning",
  failed: "Upload failed",
};

export interface SongDraft {
  id: string;
  audioFile: File;
  metadata: AudioMetadata | null;
  status: DraftStatus;

  title: string;
  artist: string;
  album: string;
  genre: string;
  releaseDate: string;
  trackNumber: string;
  discNumber: string;
  duration: number;

  section: SongSection;
  trending: boolean;
  trendingPosition: string;
  sectionTouched: boolean;
  trendingTouched: boolean;

  coverFile: File | null;
  coverPreviewUrl: string | null;
  coverFromEmbedded: boolean;
  coverError: string;

  audioHash: string | null;
  albumResolution: AlbumResolution | null;
  duplicate: DuplicateMatch | null;
  duplicateAcknowledged: boolean;

  errorMessage: string;
  warningMessage: string;
  publishedSongId: string | null;
}

export const NO_ARTWORK_MESSAGE =
  "No embedded artwork was found. Please add a cover image before publishing.";

function createDraftId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createEmptyDraft(
  audioFile: File,
  section: SongSection,
  trending: boolean,
): SongDraft {
  return {
    id: createDraftId(),
    audioFile,
    metadata: null,
    status: "reading-metadata",
    title: "",
    artist: "",
    album: "",
    genre: "",
    releaseDate: "",
    trackNumber: "",
    discNumber: "",
    duration: 0,
    section,
    trending,
    trendingPosition: "",
    sectionTouched: false,
    trendingTouched: false,
    coverFile: null,
    coverPreviewUrl: null,
    coverFromEmbedded: false,
    coverError: "",
    audioHash: null,
    albumResolution: null,
    duplicate: null,
    duplicateAcknowledged: false,
    errorMessage: "",
    warningMessage: "",
    publishedSongId: null,
  };
}

export function isDraftReady(draft: SongDraft): boolean {
  if (draft.status === "published" || draft.status === "published-with-warning") {
    return false;
  }

  if (!draft.title.trim() || !draft.artist.trim()) {
    return false;
  }

  if (!draft.coverFile) {
    return false;
  }

  if (draft.duplicate && !draft.duplicateAcknowledged) {
    return false;
  }

  return true;
}

export function computeDraftStatus(draft: SongDraft): DraftStatus {
  if (!draft.metadata) {
    return draft.status;
  }

  if (!draft.coverFile) {
    return "cover-required";
  }

  return isDraftReady(draft) ? "ready" : "metadata-detected";
}

/**
 * Reads all metadata, extracts and optimises embedded artwork, resolves the
 * album and checks for duplicates. Never throws for missing metadata.
 */
export async function analyzeDraft(draft: SongDraft): Promise<SongDraft> {
  const metadata = await parseAudioMetadata(draft.audioFile);

  let coverFile: File | null = null;
  let coverPreviewUrl: string | null = null;
  let coverError = "";

  if (metadata.coverFile) {
    try {
      const prepared = await prepareCoverImage(metadata.coverFile);
      coverFile = prepared.file;
      coverPreviewUrl = prepared.previewUrl;
    } catch (error) {
      coverError =
        error instanceof Error ? error.message : "The embedded artwork could not be used.";
    }
  }

  const [audioHash, albumResolution] = await Promise.all([
    computeFileHash(draft.audioFile),
    resolveAlbum(metadata.album, metadata.artist),
  ]);

  const duplicate = await findPossibleDuplicate({
    title: metadata.title,
    artist: metadata.artist,
    album: metadata.album,
    originalFileName: metadata.originalFileName,
    fileSize: metadata.fileSize,
    audioHash,
  });

  const analyzed: SongDraft = {
    ...draft,
    metadata,
    title: metadata.title,
    artist: metadata.artist,
    album: albumResolution.albumName ?? "",
    genre: metadata.genre ?? "",
    releaseDate: metadata.releaseDate ?? "",
    trackNumber: metadata.trackNumber ? String(metadata.trackNumber) : "",
    discNumber: metadata.discNumber ? String(metadata.discNumber) : "",
    duration: metadata.duration ?? 0,
    coverFile,
    coverPreviewUrl,
    coverFromEmbedded: Boolean(coverFile),
    coverError,
    audioHash,
    albumResolution,
    duplicate,
    duplicateAcknowledged: false,
    errorMessage: "",
    warningMessage: "",
    status: "metadata-detected",
  };

  return { ...analyzed, status: computeDraftStatus(analyzed) };
}

export interface PublishResult {
  song: Song;
  trendingWarning: string;
}

/**
 * Publishing pipeline:
 * matching album -> uploading audio -> uploading cover -> saving song ->
 * linking album -> adding to Trending -> published.
 *
 * Audio/cover rollback on database failure is handled inside createSong;
 * a Trending failure never rolls back a successfully published song.
 */
export async function publishDraft(
  draft: SongDraft,
  onStatus: (status: DraftStatus) => void,
): Promise<PublishResult> {
  onStatus("linking-album");

  const resolution = await resolveAlbum(draft.album, draft.artist);

  const song = await createSong({
    title: draft.title.trim(),
    artist: draft.artist.trim(),
    album: resolution.albumName,
    genre: draft.genre.trim() || null,
    section: draft.section,
    duration: draft.duration,
    releaseDate: draft.releaseDate.trim() || null,
    published: true,
    audioFile: draft.audioFile,
    coverFile: draft.coverFile,
    trackNumber: draft.trackNumber ? Number(draft.trackNumber) : null,
    discNumber: draft.discNumber ? Number(draft.discNumber) : null,
    originalFileName: draft.metadata?.originalFileName ?? draft.audioFile.name,
    audioHash: draft.audioHash,
    onStage: (stage) => {
      if (stage === "uploading-audio") onStatus("uploading-audio");
      if (stage === "uploading-cover") onStatus("uploading-cover");
      if (stage === "saving-song") onStatus("saving-song");
    },
  });

  let trendingWarning = "";

  if (draft.trending) {
    onStatus("adding-trending");

    try {
      const position = Number(draft.trendingPosition);

      await addSongToTrending(
        song.id,
        Number.isInteger(position) && position > 0 ? position : null,
      );
    } catch (error) {
      console.error("Trending insertion failed:", error);
      trendingWarning = "The song was published, but it could not be added to Trending.";
    }
  }

  onStatus(trendingWarning ? "published-with-warning" : "published");

  return { song, trendingWarning };
}

/** Retry only the Trending step — never re-creates the song row. */
export async function retryAddToTrending(songId: string, position?: string): Promise<void> {
  const parsed = Number(position);

  await addSongToTrending(songId, Number.isInteger(parsed) && parsed > 0 ? parsed : null);
}
