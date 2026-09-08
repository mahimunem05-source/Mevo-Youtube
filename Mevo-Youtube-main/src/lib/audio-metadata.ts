import jsmediatags from "jsmediatags/dist/jsmediatags.min.js";

/**
 * Extended audio metadata used by the MEVO Smart Upload system.
 *
 * Everything here is best-effort: a missing value never blocks an upload,
 * it only means the admin has to review/fill that field before publishing.
 */
export interface AudioMetadata {
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  year: number | null;
  releaseDate: string | null;
  trackNumber: number | null;
  discNumber: number | null;
  duration: number | null;
  coverFile: File | null;
  coverPreviewUrl: string | null;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  /** True when the tag reader could not find a usable title tag. */
  titleFromFileName: boolean;
  /** True when no artist tag existed and the fallback is being used. */
  artistIsFallback: boolean;
}

export const UNKNOWN_ARTIST = "Unknown Artist";

function removeFileExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, "");
}

/**
 * Turns "01_-_My__Song (Official Audio).mp3" into "My Song".
 * Keeps meaningful title text and drops obvious junk.
 */
export function fileNameToTitle(fileName: string): string {
  let value = removeFileExtension(fileName);

  value = value.replace(/[_+]+/g, " ");
  value = value.replace(/\s*[-–—]\s*/g, " - ");
  // Leading track numbering such as "01 - ", "07." or "3)".
  value = value.replace(/^\s*\d{1,3}\s*(?:[-.)\]]\s*)+/, "");
  // Common noise tags.
  value = value.replace(/\((?:official\s*)?(?:audio|video|lyrics?|hd|4k|mp3)\)/gi, " ");
  value = value.replace(/\[(?:official\s*)?(?:audio|video|lyrics?|hd|4k|mp3)\]/gi, " ");
  value = value.replace(/\b(?:128|192|320)\s*kbps\b/gi, " ");
  value = value.replace(/[|~^*]+/g, " ");
  value = value.replace(/\s*-\s*$/, "");
  value = value.replace(/^\s*-\s*/, "");
  value = value.replace(/\s{2,}/g, " ").trim();

  return value || removeFileExtension(fileName) || "Untitled";
}

function cleanTagText(value: unknown): string | null {
  if (typeof value !== "string") {
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    return null;
  }

  const cleaned = value
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return null;
  }

  const lowered = cleaned.toLowerCase();

  if (
    lowered === "unknown" ||
    lowered === "unknown album" ||
    lowered === "unknown artist" ||
    lowered === "n/a" ||
    lowered === "none"
  ) {
    return null;
  }

  return cleaned;
}

function parseNumberTag(value: unknown): number | null {
  const text = cleanTagText(value);

  if (!text) {
    return null;
  }

  // ID3 stores "3/12" style values.
  const first = text.split("/")[0]?.trim() ?? "";
  const parsed = Number.parseInt(first, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseYearTag(value: unknown): number | null {
  const text = cleanTagText(value);

  if (!text) {
    return null;
  }

  const match = text.match(/\d{4}/);

  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[0], 10);
  const currentYear = new Date().getFullYear();

  if (year < 1900 || year > currentYear + 1) {
    return null;
  }

  return year;
}

function parseFullDateTag(value: unknown): string | null {
  const text = cleanTagText(value);

  if (!text) {
    return null;
  }

  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);

  if (!match) {
    return null;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

interface RawTagFrame {
  data?: unknown;
}

function readRawFrame(tags: Record<string, unknown>, key: string): unknown {
  const container = tags["tags"];

  const source =
    container && typeof container === "object" ? (container as Record<string, unknown>) : tags;

  const frame = source[key];

  if (frame && typeof frame === "object" && "data" in frame) {
    return (frame as RawTagFrame).data;
  }

  return frame;
}

function pictureToFile(
  picture: { format?: string; data?: number[] } | undefined,
  audioFileName: string,
): File | null {
  if (!picture?.data?.length) {
    return null;
  }

  const mimeType = picture.format || "image/jpeg";
  const bytes = new Uint8Array(picture.data);
  const blob = new Blob([bytes], { type: mimeType });

  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";

  const baseName = removeFileExtension(audioFileName) || "cover";

  return new File([blob], `${baseName}-cover.${extension}`, {
    type: mimeType,
  });
}

export function getAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }

    const audio = document.createElement("audio");
    const objectUrl = URL.createObjectURL(file);

    const finish = (value: number | null) => {
      URL.revokeObjectURL(objectUrl);
      resolve(value);
    };

    audio.preload = "metadata";

    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      finish(Number.isFinite(duration) ? Math.round(duration) : null);
    };

    audio.onerror = () => finish(null);

    audio.src = objectUrl;
  });
}

function readTags(file: File): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    try {
      jsmediatags.read(file, {
        onSuccess: (result) => resolve((result?.tags ?? {}) as Record<string, unknown>),
        onError: () => resolve(null),
      });
    } catch {
      resolve(null);
    }
  });
}

/**
 * SHA-256 of the audio bytes. Used only for duplicate detection; failures
 * are non-fatal (large files or unsupported environments simply skip it).
 */
export async function computeFileHash(file: File): Promise<string | null> {
  try {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      return null;
    }

    const buffer = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buffer);

    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}

/** Reads every supported metadata field from an audio file. */
export async function parseAudioMetadata(file: File): Promise<AudioMetadata> {
  const [tags, duration] = await Promise.all([readTags(file), getAudioDuration(file)]);

  const safeTags = tags ?? {};

  const title = cleanTagText(safeTags["title"]);
  const artist = cleanTagText(safeTags["artist"]);
  const album = cleanTagText(safeTags["album"]);
  const genre = cleanTagText(safeTags["genre"]);

  const year =
    parseYearTag(safeTags["year"]) ??
    parseYearTag(readRawFrame(safeTags, "TYER")) ??
    parseYearTag(readRawFrame(safeTags, "TDRC")) ??
    parseYearTag(readRawFrame(safeTags, "TDRL"));

  const releaseDate =
    parseFullDateTag(readRawFrame(safeTags, "TDRC")) ??
    parseFullDateTag(readRawFrame(safeTags, "TDRL")) ??
    (year ? `${year}-01-01` : null);

  const trackNumber =
    parseNumberTag(safeTags["track"]) ?? parseNumberTag(readRawFrame(safeTags, "TRCK"));

  const discNumber =
    parseNumberTag(readRawFrame(safeTags, "TPOS")) ?? parseNumberTag(safeTags["disk"]);

  const coverFile = pictureToFile(
    safeTags["picture"] as { format?: string; data?: number[] } | undefined,
    file.name,
  );

  return {
    title: title ?? fileNameToTitle(file.name),
    artist: artist ?? UNKNOWN_ARTIST,
    album,
    genre,
    year,
    releaseDate,
    trackNumber,
    discNumber,
    duration,
    coverFile,
    coverPreviewUrl: coverFile ? URL.createObjectURL(coverFile) : null,
    originalFileName: file.name,
    mimeType: file.type || "audio/mpeg",
    fileSize: file.size,
    titleFromFileName: !title,
    artistIsFallback: !artist,
  };
}
