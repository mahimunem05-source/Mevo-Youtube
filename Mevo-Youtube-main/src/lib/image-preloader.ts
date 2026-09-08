/**
 * High-performance image preloader and cache manager.
 * Decodes images off the main thread using the browser's native Image.decode() API
 * to prevent main-thread layout hitches during fast scrolling and page navigation.
 */
const imageCache = new Set<string>();

export function preloadImage(src: string): void {
  if (!src || typeof window === "undefined" || imageCache.has(src)) {
    return;
  }

  imageCache.add(src);

  const img = new Image();
  img.src = src;

  if ("decode" in img) {
    img.decode().catch(() => {
      // Ignore decoding errors for broken/aborted images
    });
  }
}

export function preloadImages(srcs: string[]): void {
  for (const src of srcs) {
    if (src) preloadImage(src);
  }
}
