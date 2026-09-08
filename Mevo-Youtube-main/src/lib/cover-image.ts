/**
 * Cover image validation and optimisation for the MEVO admin uploader.
 *
 * The goal is a small, browser-safe, good-looking cover without cropping
 * anything important: images are only downscaled, never cut.
 */

export const ACCEPTED_COVER_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";

const MAX_COVER_INPUT_SIZE = 15 * 1024 * 1024;
const MAX_COVER_DIMENSION = 1200;
const TARGET_QUALITY = 0.9;

export interface PreparedCover {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
}

function isAcceptedImage(file: File): boolean {
  const validMime = ["image/jpeg", "image/png", "image/webp"].includes(file.type);

  const validExtension = /\.(jpe?g|png|webp)$/i.test(file.name);

  return validMime || validExtension;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This image file is corrupted or unreadable."));
    };

    image.src = url;
  });
}

function canvasToFile(
  canvas: HTMLCanvasElement,
  fileName: string,
  mimeType: string,
): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not optimise the cover image."));
          return;
        }

        resolve(new File([blob], fileName, { type: mimeType }));
      },
      mimeType,
      TARGET_QUALITY,
    );
  });
}

function replaceExtension(fileName: string, extension: string): string {
  const base = fileName.replace(/\.[^/.]+$/, "") || "cover";
  return `${base}.${extension}`;
}

/**
 * Validates an image file and returns an optimised, browser-safe version.
 * Throws a human-readable error for unsupported or corrupted files.
 */
export async function prepareCoverImage(file: File): Promise<PreparedCover> {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error("Please select a valid cover image.");
  }

  if (!isAcceptedImage(file)) {
    throw new Error("Cover image must be a JPG, PNG, or WebP file.");
  }

  if (file.size > MAX_COVER_INPUT_SIZE) {
    throw new Error("Cover image must be 15 MB or smaller.");
  }

  if (typeof document === "undefined") {
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      width: 0,
      height: 0,
    };
  }

  const image = await loadImage(file);

  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;

  if (!naturalWidth || !naturalHeight) {
    throw new Error("This image file is corrupted or unreadable.");
  }

  const scale = Math.min(1, MAX_COVER_DIMENSION / Math.max(naturalWidth, naturalHeight));

  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  const needsResize = scale < 1;
  const needsConversion = !["image/jpeg", "image/webp", "image/png"].includes(file.type);

  const needsCompression = file.size > 400 * 1024;

  if (!needsResize && !needsConversion && !needsCompression) {
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      width: naturalWidth,
      height: naturalHeight,
    };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      width: naturalWidth,
      height: naturalHeight,
    };
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, width, height);

  const outputMime = file.type === "image/png" ? "image/png" : "image/jpeg";
  const extension = outputMime === "image/png" ? "png" : "jpg";

  let optimised = await canvasToFile(canvas, replaceExtension(file.name, extension), outputMime);

  // Never make the file bigger than the original.
  if (optimised.size >= file.size && !needsResize && !needsConversion) {
    optimised = file;
  }

  return {
    file: optimised,
    previewUrl: URL.createObjectURL(optimised),
    width,
    height,
  };
}
