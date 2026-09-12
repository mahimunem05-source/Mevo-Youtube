/**
 * Python Audio Extractor & Search Engine Microservice Client
 * Communicates with the local yt-dlp, ffmpeg & multi-key YouTube API backend service.
 */

export interface ExtractorVideoInfo {
  id: string;
  title: string;
  artist?: string;
  duration?: number;
  thumbnail?: string;
  stream_url?: string;
  audioUrl?: string;
  uploader?: string;
  channelTitle?: string;
  view_count?: number;
  viewCount?: number;
  publishedAt?: string;
  description?: string;
}

export interface ExtractorSearchResult {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  stream_url: string;
  channelTitle?: string;
  uploader?: string;
  viewCount?: number;
  view_count?: number;
  publishedAt?: string;
  description?: string;
}

export interface ExtractorSearchResponse {
  items: ExtractorSearchResult[];
  count: number;
  source: "youtube_api" | "yt_dlp" | "cache" | "none" | "error";
  query: string;
}

export interface ExtractorHealth {
  status: string;
  timestamp: string;
  service: string;
  ffmpeg_available?: boolean;
  ffmpeg_path?: string;
  key_pool?: {
    total_keys: number;
    active_keys: number;
    exhausted_keys: number;
    has_available_key: boolean;
    keys_preview: string[];
  };
  cache?: {
    total_entries: number;
    valid_entries: number;
    default_ttl_hours: number;
  };
}

/**
 * Extracts a clean 11-character YouTube video ID or returns the sanitized string
 */
export function extractYouTubeVideoId(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();

  // If already an 11-character ID (with no slashes/queries)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Handle various YouTube URL formats
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const pathname = url.pathname.slice(1);
      return pathname.split("/")[0] || trimmed;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v") || trimmed;
      }
      if (url.pathname.startsWith("/embed/")) {
        return url.pathname.split("/")[2] || trimmed;
      }
      if (url.pathname.startsWith("/v/")) {
        return url.pathname.split("/")[2] || trimmed;
      }
      if (url.pathname.startsWith("/shorts/")) {
        return url.pathname.split("/")[2] || trimmed;
      }
    }
  } catch {
    // URL parsing failed, fall back to regex
  }

  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/);
  if (match && match[1]) {
    return match[1];
  }

  return trimmed;
}

/**
 * Builds the canonical YouTube watch URL for a video ID or URL
 */
export function buildYouTubeWatchUrl(videoIdOrUrl: string): string {
  const id = extractYouTubeVideoId(videoIdOrUrl);
  if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return `https://www.youtube.com/watch?v=${id}`;
  }
  if (videoIdOrUrl.startsWith("http://") || videoIdOrUrl.startsWith("https://")) {
    return videoIdOrUrl;
  }
  return `https://www.youtube.com/watch?v=${videoIdOrUrl}`;
}

export function getExtractorBaseUrl(): string {
  const metaEnv = (
    typeof import.meta !== "undefined" && import.meta.env ? import.meta.env : {}
  ) as Record<string, string | undefined>;

  // In local development (npm run dev), route through local Vite dev server middleware
  if (metaEnv.DEV) {
    return "";
  }

  // Node.js CLI / testing fallback to active local dev server
  if (typeof window === "undefined" && typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
    return "http://localhost:5173";
  }

  const configured = metaEnv.VITE_EXTRACTOR_URL || metaEnv.VITE_EXTRACTOR_API_URL;
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  return "https://mevo-extractor.onrender.com";
}

/**
 * Checks if the local extractor microservice is running and accessible
 */
export async function checkExtractorHealth(): Promise<ExtractorHealth> {
  const baseUrl = getExtractorBaseUrl();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Microservice responded with HTTP ${res.status}`);
    }

    return await res.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Service unreachable";
    throw new Error(`Audio Extractor microservice offline at ${baseUrl} (${message}). Please start backend/extractor_api.py`);
  }
}

/**
 * Fetches uniform metadata for a YouTube video via the microservice /api/extract (or /extract /info) endpoint
 */
export async function getVideoInfo(videoId: string): Promise<ExtractorVideoInfo> {
  const baseUrl = getExtractorBaseUrl();
  const cleanId = extractYouTubeVideoId(videoId) || videoId.replace(/^yt-/, "").trim();
  const url = buildYouTubeWatchUrl(cleanId);

  try {
    let res = await fetch(`${baseUrl}/api/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, videoId: cleanId, id: cleanId }),
    });

    if (!res.ok) {
      // Fallback: try GET with query parameters
      res = await fetch(`${baseUrl}/api/extract?id=${encodeURIComponent(cleanId)}`);
    }

    if (!res.ok) {
      let errMessage = `HTTP ${res.status}`;
      try {
        const data = await res.json();
        if (data.error) errMessage = data.error;
      } catch {}
      throw new Error(errMessage);
    }

    const data = await res.json();
    const resolvedStreamUrl =
      data.stream_url ||
      data.audioUrl ||
      `${baseUrl}/stream?id=${encodeURIComponent(data.id || cleanId)}`;

    return {
      id: data.id || cleanId,
      title: data.title || "Unknown Title",
      artist: data.artist || data.uploader || data.channelTitle || "YouTube Artist",
      duration: typeof data.duration === "number" ? Math.round(data.duration) : undefined,
      thumbnail: data.thumbnail || `https://img.youtube.com/vi/${cleanId}/hqdefault.jpg`,
      stream_url: resolvedStreamUrl,
      audioUrl: data.audioUrl || resolvedStreamUrl,
      uploader: data.uploader || data.artist || undefined,
      channelTitle: data.channelTitle || data.artist || undefined,
      view_count: data.view_count || data.viewCount || undefined,
      viewCount: data.viewCount || data.view_count || undefined,
      description: data.description || undefined,
    };
  } catch (error) {
    console.warn("Extractor getVideoInfo fallback notice:", error);
    // Reliable fallback so player and route loaders never stall with empty audio sources
    const fallbackStreamUrl = `${baseUrl}/stream?id=${encodeURIComponent(cleanId)}`;
    return {
      id: cleanId,
      title: "YouTube Track",
      artist: "YouTube Artist",
      duration: 0,
      thumbnail: `https://img.youtube.com/vi/${cleanId}/hqdefault.jpg`,
      stream_url: fallbackStreamUrl,
      audioUrl: fallbackStreamUrl,
    };
  }
}

/**
 * Executes a search query on the backend extractor microservice with multi-key pool, rotation, and yt-dlp fallback
 */
export async function searchExtractor(
  query: string,
  limit = 25
): Promise<ExtractorSearchResponse> {
  const baseUrl = getExtractorBaseUrl();
  const trimmed = query.trim();
  if (!trimmed) {
    return { items: [], count: 0, source: "none", query: "" };
  }

  const endpoint = `${baseUrl}/api/search?q=${encodeURIComponent(trimmed)}&limit=${limit}&type=search&pool=search`;
  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error(`Search request failed with status HTTP ${res.status}`);
  }

  return await res.json();
}

export function getYouTubeStreamUrl(videoIdOrUrl: string): string {
  const baseUrl = getExtractorBaseUrl();
  const videoId = extractYouTubeVideoId(videoIdOrUrl);
  return `${baseUrl}/stream?id=${encodeURIComponent(videoId || videoIdOrUrl)}`;
}

export function getYouTubeDownloadUrl(videoIdOrUrl: string): string {
  const baseUrl = getExtractorBaseUrl();
  const videoId = extractYouTubeVideoId(videoIdOrUrl);
  return `${baseUrl}/download?id=${encodeURIComponent(videoId || videoIdOrUrl)}`;
}

/**
 * Downloads audio from YouTube as an MP3 Blob via the microservice /download endpoint
 */
export async function downloadYouTubeAudio(
  videoId: string,
  quality: "fast" | "128" = "fast"
): Promise<Blob> {
  const baseUrl = getExtractorBaseUrl();
  const url = buildYouTubeWatchUrl(videoId);

  try {
    const res = await fetch(`${baseUrl}/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, quality }),
    });

    if (!res.ok) {
      let errMessage = `Extraction failed (HTTP ${res.status})`;
      try {
        const data = await res.json();
        if (data.error) errMessage = data.error;
      } catch {
        // use default
      }
      throw new Error(errMessage);
    }

    const blob = await res.blob();
    if (blob.size === 0) {
      throw new Error("Received empty audio file from extractor microservice.");
    }

    return blob;
  } catch (error) {
    console.error("Failed to download audio:", error);
    throw new Error(
      error instanceof Error ? error.message : "Audio extraction failed. Verify that backend is running."
    );
  }
}
