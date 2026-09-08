import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Configuration for Backblaze B2 & Cloudflare Worker CDN
 */
export function getB2Config() {
  const metaEnv = (
    typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {}
  ) as Record<string, string | undefined>;

  const endpoint = metaEnv.VITE_B2_ENDPOINT || "https://s3.us-east-005.backblazeb2.com";
  const region = metaEnv.VITE_B2_REGION || "us-east-005";
  const bucket = metaEnv.VITE_B2_BUCKET || "mevo-music";
  const keyId = metaEnv.VITE_B2_KEY_ID || "";
  const applicationKey = metaEnv.VITE_B2_APPLICATION_KEY || "";
  const deliveryUrl = (
    metaEnv.VITE_CLOUDFLARE_DELIVERY_URL || "https://mevo-media.mahimunem05.workers.dev"
  ).replace(/\/+$/, "");

  return { endpoint, region, bucket, keyId, applicationKey, deliveryUrl };
}

export function sanitizeFileName(fileName: string): string {
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
  return (
    nameWithoutExt
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "file"
  );
}

export function getFileExtension(fileName: string, fallback: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext && /^[a-z0-9]+$/.test(ext) ? ext : fallback;
}

export interface B2UploadResult {
  /** The S3 / B2 object key (e.g. songs/1740441600000-mysong.mp3) */
  key: string;
  /** The public Cloudflare Worker delivery URL */
  publicUrl: string;
}

function createS3Client() {
  const config = getB2Config();
  if (!config.keyId || !config.applicationKey) {
    throw new Error(
      "Backblaze B2 credentials missing. Please set VITE_B2_KEY_ID and VITE_B2_APPLICATION_KEY in .env.local",
    );
  }

  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.keyId,
      secretAccessKey: config.applicationKey,
    },
  });
}

/**
 * Uploads a file buffer directly to Backblaze B2 using AWS S3 SDK.
 */
export async function uploadBufferToB2(
  buffer: Uint8Array,
  fileName: string,
  folder: "songs" | "covers",
  contentType: string,
): Promise<B2UploadResult> {
  const config = getB2Config();
  const safeName = sanitizeFileName(fileName);
  const ext = getFileExtension(fileName, folder === "songs" ? "mp3" : "jpg");
  const timestamp = Date.now();
  const key = `${folder}/${timestamp}-${safeName}.${ext}`;
  const publicUrl = `${config.deliveryUrl}/${key}`;

  const s3 = createS3Client();

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType || (folder === "songs" ? "audio/mpeg" : "image/jpeg"),
  });

  await s3.send(command);

  return { key, publicUrl };
}

/**
 * Client Upload Helper:
 * Uploads a File directly to Backblaze B2 with optional progress notification.
 */
export async function uploadFileToB2WithProgress(
  file: File,
  folder: "songs" | "covers",
  onProgress?: (percent: number) => void,
): Promise<B2UploadResult> {
  onProgress?.(10);
  const arrayBuffer = await file.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  onProgress?.(40);

  const contentType = file.type || (folder === "songs" ? "audio/mpeg" : "image/jpeg");
  const result = await uploadBufferToB2(uint8, file.name, folder, contentType);

  onProgress?.(100);
  return result;
}

/**
 * Upload an audio file (.mp3/.wav/.m4a) to Backblaze B2 songs/ folder.
 */
export async function uploadAudioToB2(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<B2UploadResult> {
  return uploadFileToB2WithProgress(file, "songs", onProgress);
}

/**
 * Upload a cover image (.png/.jpg/.webp) to Backblaze B2 covers/ folder.
 */
export async function uploadCoverToB2(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<B2UploadResult> {
  return uploadFileToB2WithProgress(file, "covers", onProgress);
}

/**
 * Extracts B2 object key from either a key, a Cloudflare delivery URL, or a legacy path.
 */
export function extractB2Key(keyOrUrl: string | null | undefined): string | null {
  if (!keyOrUrl) return null;

  let path = keyOrUrl.trim();

  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const urlObj = new URL(path);
      path = urlObj.pathname.replace(/^\/+/, "");
    } catch {
      return null;
    }
  }

  path = path.replace(/^\/+/, "");

  if (path.startsWith("songs/") || path.startsWith("covers/")) {
    return path;
  }

  if (path.startsWith("music/")) {
    return `songs/${path.slice(6)}`;
  }

  return null;
}

/**
 * Deletes a file from Backblaze B2.
 */
export async function deleteFileFromB2(keyOrUrl: string | null | undefined): Promise<void> {
  const key = extractB2Key(keyOrUrl);
  if (!key) return;

  try {
    const config = getB2Config();
    if (!config.keyId || !config.applicationKey) {
      return;
    }

    const s3 = createS3Client();
    await s3.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );
  } catch (error) {
    console.warn(`B2 Delete failed for key ${key}:`, error);
  }
}
