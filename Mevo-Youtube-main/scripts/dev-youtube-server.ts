import type { Plugin, ViteDevServer } from "vite";
import fs from "node:fs";
import path from "node:path";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<any>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlSeconds: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
}

class DevKeyPool {
  private keys: string[] = [];
  private currentIdx = 0;
  private exhausted = new Map<string, number>();

  constructor() {
    this.reload();
  }

  reload() {
    try {
      const envPath = path.resolve(process.cwd(), ".env.local");
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        const match = content.match(/YOUTUBE_API_KEYS=["']?([^"'\r\n]+)/);
        if (match && match[1]) {
          this.keys = match[1]
            .split(/[,;\s]+/)
            .map((k) => k.trim().replace(/^["']|["']$/g, ""))
            .filter(Boolean);
        }
      }
    } catch {
      // ignore
    }
    if (this.keys.length === 0 && process.env.YOUTUBE_API_KEYS) {
      this.keys = process.env.YOUTUBE_API_KEYS.split(/[,;\s]+/).map((k) => k.trim()).filter(Boolean);
    }
    console.log(`[Vite Dev YouTube] Loaded ${this.keys.length} API key(s) from .env.local`);
  }

  getActiveKey(): string | null {
    if (this.keys.length === 0) return null;
    const now = Date.now();
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.currentIdx + i) % this.keys.length;
      const key = this.keys[idx];
      const exhaustedTime = this.exhausted.get(key);
      if (exhaustedTime && now - exhaustedTime < 3600 * 1000) {
        continue;
      }
      this.currentIdx = idx;
      return key;
    }
    return this.keys[0] || null;
  }

  markExhausted(key: string) {
    this.exhausted.set(key, Date.now());
    this.currentIdx = (this.currentIdx + 1) % Math.max(1, this.keys.length);
    console.warn(`[Vite Dev YouTube] Key ${key.slice(0, 8)}... exhausted, rotating to next key`);
  }
}

function parseIsoDuration(durationStr: string): number {
  if (!durationStr || !durationStr.startsWith("P")) return 0;
  const match = durationStr.match(/P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

async function getDirectAudioUrl(videoId: string): Promise<string | null> {
  const cleanId = videoId.replace(/^yt-/, "").trim();
  if (!cleanId) return null;
  try {
    const res = await fetch("https://www.youtube.com/youtubei/v1/player", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: JSON.stringify({
        videoId: cleanId,
        context: {
          client: {
            clientName: "ANDROID_VR",
            clientVersion: "1.61.48",
            deviceMake: "Oculus",
            deviceModel: "Quest 3",
            osName: "Android",
            osVersion: "12",
          },
        },
      }),
    });
    const data = await res.json();
    const formats = data.streamingData?.adaptiveFormats || [];
    const audioFormats = formats.filter((f: any) => f.mimeType?.includes("audio/"));
    audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
    for (const af of audioFormats) {
      if (af.url) return af.url;
    }
  } catch (err) {
    console.error("[Vite Dev YouTube] Error extracting stream for", cleanId, err);
  }
  return null;
}

export function devYouTubePlugin(): Plugin {
  const pool = new DevKeyPool();
  const cache = new MemoryCache();

  async function fetchWithKey(urlBuilder: (key: string) => string): Promise<any> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const key = pool.getActiveKey();
      if (!key) throw new Error("No YouTube API keys available in .env.local");
      const url = urlBuilder(key);
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        const code = data.error.code;
        if (code === 403) {
          pool.markExhausted(key);
          continue;
        }
        throw new Error(data.error.message || `YouTube API error ${code}`);
      }
      return data;
    }
    throw new Error("All YouTube API keys exhausted or rate-limited");
  }

  async function getVideoDetails(videoIds: string[]): Promise<Map<string, any>> {
    const detailsMap = new Map<string, any>();
    if (videoIds.length === 0) return detailsMap;

    const batches: string[][] = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      batches.push(videoIds.slice(i, i + 50));
    }

    for (const batch of batches) {
      try {
        const data = await fetchWithKey(
          (key) =>
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${batch.join(",")}&key=${key}`
        );
        for (const it of data.items || []) {
          const id = it.id;
          const snippet = it.snippet || {};
          const content = it.contentDetails || {};
          const stats = it.statistics || {};
          const duration = parseIsoDuration(content.duration || "");
          const viewCount = parseInt(stats.viewCount || "0", 10);
          const thumb =
            snippet.thumbnails?.maxres?.url ||
            snippet.thumbnails?.high?.url ||
            snippet.thumbnails?.medium?.url ||
            snippet.thumbnails?.default?.url ||
            `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

          detailsMap.set(id, {
            id,
            title: snippet.title || "",
            channelTitle: snippet.channelTitle || "",
            thumbnail: thumb,
            duration,
            viewCount,
            publishedAt: snippet.publishedAt || "",
            description: snippet.description || "",
          });
        }
      } catch (err) {
        console.warn("[Vite Dev YouTube] Error fetching video details batch:", err);
      }
    }
    return detailsMap;
  }

  return {
    name: "vite-dev-youtube-middleware",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const urlObj = new URL(req.url || "/", "http://localhost");
        const pathname = urlObj.pathname;

        // 1. /api/youtube/trending
        if (pathname === "/api/youtube/trending" || pathname === "/api/trending") {
          const region = urlObj.searchParams.get("region") || "BD";
          const limit = Math.min(50, Math.max(5, parseInt(urlObj.searchParams.get("limit") || "16", 10)));
          const sectionId = urlObj.searchParams.get("sectionId") || "bangla";
          const cacheKey = `trending:${region}:${limit}`;

          const cached = cache.get(cacheKey);
          if (cached) {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify(cached));
            return;
          }

          try {
            const data = await fetchWithKey(
              (key) =>
                `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&chart=mostPopular&videoCategoryId=10&regionCode=${encodeURIComponent(region)}&maxResults=${limit}&key=${key}`
            );
            const items = (data.items || []).map((it: any) => {
              const snippet = it.snippet || {};
              const content = it.contentDetails || {};
              const stats = it.statistics || {};
              const id = it.id;
              return {
                id,
                title: snippet.title || "",
                artist: snippet.channelTitle || "",
                thumbnail:
                  snippet.thumbnails?.maxres?.url ||
                  snippet.thumbnails?.high?.url ||
                  snippet.thumbnails?.medium?.url ||
                  `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
                duration: parseIsoDuration(content.duration || ""),
                viewCount: parseInt(stats.viewCount || "0", 10),
                publishedAt: snippet.publishedAt || "",
                section: sectionId,
              };
            });
            const result = { items, count: items.length, source: "youtube_api" };
            cache.set(cacheKey, result, 1500); // 25 min TTL
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify(result));
            return;
          } catch (err: any) {
            console.error("[Vite Dev YouTube] Trending error:", err.message);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
        }

        // 2. /api/youtube/category
        if (pathname === "/api/youtube/category" || pathname === "/api/category") {
          const query = urlObj.searchParams.get("q") || "";
          const order = urlObj.searchParams.get("order") || "viewCount";
          const limit = Math.min(50, Math.max(5, parseInt(urlObj.searchParams.get("limit") || "16", 10)));
          const sectionId = urlObj.searchParams.get("sectionId") || "bangla";
          const pageToken = urlObj.searchParams.get("pageToken") || "";
          const cacheKey = `category:${query}:${order}:${limit}:${pageToken}`;

          const cached = cache.get(cacheKey);
          if (cached) {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify(cached));
            return;
          }

          try {
            const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
            const data = await fetchWithKey(
              (key) =>
                `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&order=${encodeURIComponent(order)}&maxResults=${limit}${pageParam}&key=${key}`
            );
            const videoIds = (data.items || []).map((it: any) => it.id?.videoId).filter(Boolean);
            const details = await getVideoDetails(videoIds);

            const songs = videoIds.map((id: string) => {
              const d = details.get(id);
              return {
                id,
                title: d?.title || "",
                artist: d?.channelTitle || "",
                thumbnail: d?.thumbnail || `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
                duration: d?.duration || 0,
                viewCount: d?.viewCount || 0,
                publishedAt: d?.publishedAt || "",
                section: sectionId,
              };
            });

            const result = { songs, nextPageToken: data.nextPageToken || null, count: songs.length };
            cache.set(cacheKey, result, 2700); // 45 min TTL
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify(result));
            return;
          } catch (err: any) {
            console.error("[Vite Dev YouTube] Category error:", err.message);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
        }

        // 3. /api/youtube/videos
        if (pathname === "/api/youtube/videos" || pathname === "/api/videos") {
          const idsParam = urlObj.searchParams.get("ids") || "";
          const videoIds = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
          try {
            const detailsMap = await getVideoDetails(videoIds);
            const items: Record<string, any> = {};
            for (const [id, d] of detailsMap.entries()) {
              items[id] = d;
            }
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify({ items, count: Object.keys(items).length }));
            return;
          } catch (err: any) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
        }

        // 4. /api/search
        if (pathname === "/api/search") {
          const query = urlObj.searchParams.get("q") || "";
          const limit = Math.min(50, Math.max(5, parseInt(urlObj.searchParams.get("limit") || "12", 10)));
          const cacheKey = `search:${query}:${limit}`;

          const cached = cache.get(cacheKey);
          if (cached) {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify(cached));
            return;
          }

          try {
            const data = await fetchWithKey(
              (key) =>
                `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=${limit}&key=${key}`
            );
            const videoIds = (data.items || []).map((it: any) => it.id?.videoId).filter(Boolean);
            const details = await getVideoDetails(videoIds);

            const items = videoIds.map((id: string) => {
              const d = details.get(id);
              return {
                id,
                title: d?.title || "",
                artist: d?.channelTitle || "",
                thumbnail: d?.thumbnail || `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
                duration: d?.duration || 0,
                viewCount: d?.viewCount || 0,
                publishedAt: d?.publishedAt || "",
                stream_url: `https://mevo-extractor.onrender.com/stream?id=${id}`,
              };
            });

            const result = { items, count: items.length, source: "youtube_api", query };
            cache.set(cacheKey, result, 7200); // 2 hour TTL
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify(result));
            return;
          } catch (err: any) {
            console.error("[Vite Dev YouTube] Search error:", err.message);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
        }

        // 5. /stream with direct local IP extraction (zero 403 IP-lock errors)
        if (pathname === "/stream") {
          const rawId = urlObj.searchParams.get("id") || urlObj.searchParams.get("url") || "";
          const vidId = rawId.replace(/^yt-/, "").trim();
          if (!vidId) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Missing video ID" }));
            return;
          }

          const streamCacheKey = `stream:${vidId}`;
          let audioUrl = cache.get<string>(streamCacheKey);

          if (!audioUrl) {
            audioUrl = await getDirectAudioUrl(vidId);
            if (audioUrl) {
              cache.set(streamCacheKey, audioUrl, 10800); // 3-hour TTL
            }
          }

          if (audioUrl) {
            if (req.method === "POST") {
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify({ audioUrl, stream_url: audioUrl, id: vidId }));
              return;
            }

            res.writeHead(302, {
              Location: audioUrl,
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Headers": "*",
              "Cache-Control": "public, max-age=7200",
            });
            res.end();
            return;
          }

          // Fallback to Render if local extraction fails
          res.writeHead(302, {
            Location: `https://mevo-extractor.onrender.com/stream?id=${encodeURIComponent(vidId)}`,
            "Access-Control-Allow-Origin": "*",
          });
          res.end();
          return;
        }

        // 6. /api/queue/related proxy
        if (pathname === "/api/queue/related") {
          const vidId = urlObj.searchParams.get("id") || urlObj.searchParams.get("videoId") || "";
          try {
            const renderRes = await fetch(`https://mevo-extractor.onrender.com/api/queue/related?id=${encodeURIComponent(vidId)}`);
            if (renderRes.ok) {
              const data = await renderRes.json();
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify(data));
              return;
            }
          } catch {
            // fallback
          }
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(JSON.stringify({ tracks: [], source: "none" }));
          return;
        }

        next();
      });
    },
  };
}
