import type { Plugin, ViteDevServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import { parseLrc, alignPlainLyrics, processLyricsLines, cleanSongTitle } from "../src/services/lyricsService.ts";
import { getDirectAudioStreamUrl } from "./youtube-solver.ts";

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

class SingleKeyPool {
  readonly name: string;
  private keys: string[] = [];
  private currentIdx = 0;
  private exhausted = new Map<string, number>();

  constructor(name: string, keys: string[] = []) {
    this.name = name;
    this.keys = keys;
  }

  setKeys(keys: string[]) {
    this.keys = keys;
    this.currentIdx = 0;
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
    return null;
  }

  markExhausted(key: string, reason = "Quota Exceeded") {
    this.exhausted.set(key, Date.now());
    this.currentIdx = (this.currentIdx + 1) % Math.max(1, this.keys.length);
    const activeRemaining = this.getActiveKeyCount();
    console.warn(
      `[Vite Dev YouTube][${this.name} Pool] Key ${key.slice(0, 8)}... marked EXHAUSTED (${reason}). Active remaining: ${activeRemaining}/${this.keys.length}`
    );
  }

  getActiveKeyCount(): number {
    const now = Date.now();
    return this.keys.filter((k) => {
      const exp = this.exhausted.get(k);
      return !exp || now - exp >= 3600 * 1000;
    }).length;
  }

  getStatus() {
    const now = Date.now();
    const active = this.keys.filter((k) => {
      const exp = this.exhausted.get(k);
      return !exp || now - exp >= 3600 * 1000;
    });
    return {
      name: this.name,
      total_keys: this.keys.length,
      active_keys: active.length,
      exhausted_keys: this.keys.length - active.length,
      has_available_key: active.length > 0,
      keys_preview: this.keys.map((k) => (k.length > 8 ? `${k.slice(0, 6)}...${k.slice(-4)}` : "***")),
    };
  }
}

class DevKeyPoolManager {
  readonly discoveryPool = new SingleKeyPool("Song Discovery");
  readonly searchPool = new SingleKeyPool("Search");

  constructor() {
    this.reload();
  }

  reload() {
    let discoveryKeys: string[] = [];
    let searchKeys: string[] = [];
    let fallbackKeys: string[] = [];

    try {
      const envPath = path.resolve(process.cwd(), ".env.local");
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");

        const discMatch = content.match(/SONG_DISCOVERY_API_KEYS=["']?([^"'\r\n]+)/);
        if (discMatch && discMatch[1]) {
          discoveryKeys = this.parseKeys(discMatch[1]);
        }

        const searchMatch = content.match(/SEARCH_API_KEYS=["']?([^"'\r\n]+)/);
        if (searchMatch && searchMatch[1]) {
          searchKeys = this.parseKeys(searchMatch[1]);
        }

        const match = content.match(/YOUTUBE_API_KEYS=["']?([^"'\r\n]+)/);
        if (match && match[1]) {
          fallbackKeys = this.parseKeys(match[1]);
        }
      }
    } catch {
      // ignore
    }

    if (discoveryKeys.length === 0 && process.env.SONG_DISCOVERY_API_KEYS) {
      discoveryKeys = this.parseKeys(process.env.SONG_DISCOVERY_API_KEYS);
    }
    if (searchKeys.length === 0 && process.env.SEARCH_API_KEYS) {
      searchKeys = this.parseKeys(process.env.SEARCH_API_KEYS);
    }
    if (fallbackKeys.length === 0 && process.env.YOUTUBE_API_KEYS) {
      fallbackKeys = this.parseKeys(process.env.YOUTUBE_API_KEYS);
    }

    // Partition fallback keys if explicit pools were not specified
    if (discoveryKeys.length === 0 && searchKeys.length === 0 && fallbackKeys.length > 0) {
      if (fallbackKeys.length >= 2) {
        searchKeys = [fallbackKeys[fallbackKeys.length - 1]];
        discoveryKeys = fallbackKeys.slice(0, fallbackKeys.length - 1);
      } else {
        discoveryKeys = [...fallbackKeys];
        searchKeys = [...fallbackKeys];
      }
    } else if (discoveryKeys.length === 0 && fallbackKeys.length > 0) {
      discoveryKeys = fallbackKeys.filter((k) => !searchKeys.includes(k));
      if (discoveryKeys.length === 0) discoveryKeys = [...fallbackKeys];
    } else if (searchKeys.length === 0 && fallbackKeys.length > 0) {
      searchKeys = fallbackKeys.filter((k) => !discoveryKeys.includes(k));
      if (searchKeys.length === 0) searchKeys = [...fallbackKeys];
    }

    this.discoveryPool.setKeys(discoveryKeys);
    this.searchPool.setKeys(searchKeys);

    console.log(
      `[Vite Dev YouTube] Dedicated Pools Initialized: Song Discovery=${discoveryKeys.length} key(s), Search=${searchKeys.length} key(s)`
    );
  }

  private parseKeys(raw: string): string[] {
    return raw
      .split(/[,;\s]+/)
      .map((k) => k.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }

  getPool(poolName: "discovery" | "search"): SingleKeyPool {
    return poolName === "discovery" ? this.discoveryPool : this.searchPool;
  }

  getStatus() {
    return {
      discovery_pool: this.discoveryPool.getStatus(),
      search_pool: this.searchPool.getStatus(),
    };
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

const SHORTS_REGEX = /#(?:shorts|short)\b|\bshorts\b|\bshort video\b|\btiktok\b|\/shorts\/|\(shorts\)|\[shorts\]/i;

function isShorts(title: string, desc = "", durationSec = 0): boolean {
  if (SHORTS_REGEX.test(title) || SHORTS_REGEX.test(desc)) return true;
  if (durationSec > 0 && durationSec < 55) return true;
  return false;
}

function calculateScore(item: { publishedAt?: string; viewCount?: number; duration?: number }): number {
  const now = Date.now();
  const pubTime = item.publishedAt ? Date.parse(item.publishedAt) : 0;
  const days = pubTime > 0 ? Math.max(0.2, (now - pubTime) / (1000 * 60 * 60 * 24)) : 365;
  const views = Math.max(0, item.viewCount || 0);

  const dailyVelocity = views / days;
  const hypeScore = Math.log10(Math.max(1, dailyVelocity)) * 12;
  const popularityScore = Math.log10(Math.max(1, views)) * 4;

  let baseFreshness = 0;
  if (days <= 7) baseFreshness = 40;
  else if (days <= 30) baseFreshness = 30;
  else if (days <= 90) baseFreshness = 20;
  else if (days <= 180) baseFreshness = 10;
  else if (days <= 365) baseFreshness = 5;
  else if (days <= 730) baseFreshness = 0;
  else if (days <= 1460) baseFreshness = -12;
  else if (days <= 2555) baseFreshness = -24;
  else baseFreshness = -38;

  const momentumScale = baseFreshness > 0 ? Math.min(1.0, Math.max(0.1, dailyVelocity / 50.0)) : 1.0;
  const freshness = baseFreshness * momentumScale;

  return hypeScore + popularityScore + freshness;
}

function getDevYouTubeCookies(): string {
  try {
    const envPath = path.resolve(process.cwd(), ".env.local");
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      const match = content.match(/YOUTUBE_COOKIES=["']?([^"'\r\n]+)/);
      if (match && match[1]) return match[1];
    }
  } catch {
    // ignore
  }
  return process.env.YOUTUBE_COOKIES || "";
}

function parseJsonBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let bodyStr = "";
    req.on("data", (chunk: any) => {
      bodyStr += chunk;
      if (bodyStr.length > 1e6) {
        req.destroy();
        resolve({});
      }
    });
    req.on("end", () => {
      if (!bodyStr) return resolve({});
      try {
        resolve(JSON.parse(bodyStr));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

async function getDirectAudioUrl(videoId: string, bypassCache = false): Promise<string | null> {
  const cleanId = videoId.replace(/^yt-/, "").trim();
  if (!cleanId) return null;

  // 1. High-speed local decipher extraction (handles signatureCipher & n throttling directly)
  try {
    const localStreamUrl = await getDirectAudioStreamUrl(cleanId, bypassCache);
    if (localStreamUrl) {
      return localStreamUrl;
    }
  } catch (solverErr) {
    console.warn("[Vite Dev YouTube] Local solver attempt notice:", solverErr);
  }

  // 2. Try querying backend extractor /stream via POST to obtain resolved audio stream URL
  try {
    const backendUrl = process.env.VITE_EXTRACTOR_URL || "https://mevo-extractor.onrender.com";
    const res = await fetch(`${backendUrl}/stream?id=${encodeURIComponent(cleanId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.audioUrl) return data.audioUrl;
      if (data.stream_url) return data.stream_url;
    }
  } catch {
    // continue to fallback
  }

  // 2. Try direct extraction with optional session cookies
  const cookies = getDevYouTubeCookies();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };
  if (cookies) {
    headers["Cookie"] = cookies;
  }

  const clients = [
    { clientName: "WEB", clientVersion: "2.20240910.01.00" },
    { clientName: "MWEB", clientVersion: "2.20240910.01.00" },
    {
      clientName: "IOS",
      clientVersion: "19.45.4",
      deviceMake: "Apple",
      deviceModel: "iPhone16,2",
      osName: "iOS",
      osVersion: "17.5.1.21F90",
    },
  ];

  for (const client of clients) {
    try {
      const res = await fetch("https://www.youtube.com/youtubei/v1/player", {
        method: "POST",
        headers,
        body: JSON.stringify({
          videoId: cleanId,
          context: { client },
        }),
      });
      const data = await res.json();
      const formats = (data.streamingData?.adaptiveFormats || []).concat(data.streamingData?.formats || []);
      const audioFormats = formats.filter((f: any) => f.mimeType?.includes("audio/"));
      audioFormats.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
      for (const af of audioFormats) {
        if (af.url) return af.url;
      }
    } catch {
      // try next client
    }
  }

  return null;
}

export function devYouTubePlugin(): Plugin {
  const poolManager = new DevKeyPoolManager();
  const cache = new MemoryCache();

  async function fetchWithKey(
    poolName: "discovery" | "search",
    urlBuilder: (key: string) => string
  ): Promise<any> {
    const primaryPool = poolManager.getPool(poolName);
    const fallbackPool = poolManager.getPool(poolName === "discovery" ? "search" : "discovery");

    // 1. Try keys from the requested primary pool
    const primaryTotal = Math.max(1, primaryPool.getStatus().total_keys);
    for (let attempt = 0; attempt < primaryTotal; attempt++) {
      const key = primaryPool.getActiveKey();
      if (!key) break;
      try {
        const url = urlBuilder(key);
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) {
          const code = data.error.code;
          const msg = (data.error.message || "").toLowerCase();
          const status = data.error.status || "";
          if (
            code === 403 ||
            code === 429 ||
            status === "RESOURCE_EXHAUSTED" ||
            msg.includes("quota") ||
            msg.includes("exceeded")
          ) {
            primaryPool.markExhausted(key, `HTTP ${code}: ${data.error.message}`);
            continue;
          }
          throw new Error(data.error.message || `YouTube API error ${code}`);
        }
        return data;
      } catch (err: any) {
        if (
          err.message &&
          (err.message.includes("quota") ||
            err.message.includes("exceeded") ||
            err.message.includes("RESOURCE_EXHAUSTED"))
        ) {
          continue;
        }
        throw err;
      }
    }

    // 2. Emergency fallback: If all keys in primary pool are exhausted, borrow from the other pool
    const fallbackTotal = Math.max(1, fallbackPool.getStatus().total_keys);
    for (let attempt = 0; attempt < fallbackTotal; attempt++) {
      const key = fallbackPool.getActiveKey();
      if (!key) break;
      try {
        console.warn(
          `[Vite Dev YouTube] Primary ${primaryPool.name} pool keys exhausted. Borrowing active key ${key.slice(0, 8)}... from ${fallbackPool.name} pool.`
        );
        const url = urlBuilder(key);
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) {
          const code = data.error.code;
          const msg = (data.error.message || "").toLowerCase();
          const status = data.error.status || "";
          if (
            code === 403 ||
            code === 429 ||
            status === "RESOURCE_EXHAUSTED" ||
            msg.includes("quota") ||
            msg.includes("exceeded")
          ) {
            fallbackPool.markExhausted(key, `HTTP ${code}: ${data.error.message}`);
            continue;
          }
          throw new Error(data.error.message || `YouTube API error ${code}`);
        }
        return data;
      } catch (err: any) {
        if (
          err.message &&
          (err.message.includes("quota") ||
            err.message.includes("exceeded") ||
            err.message.includes("RESOURCE_EXHAUSTED"))
        ) {
          continue;
        }
        throw err;
      }
    }

    throw new Error(
      `[${primaryPool.name} Pool] All YouTube API keys (including failover pool) are exhausted or unavailable`
    );
  }

  async function getVideoDetails(
    videoIds: string[],
    poolName: "discovery" | "search" = "discovery"
  ): Promise<Map<string, any>> {
    const detailsMap = new Map<string, any>();
    if (videoIds.length === 0) return detailsMap;

    const batches: string[][] = [];
    for (let i = 0; i < videoIds.length; i += 50) {
      batches.push(videoIds.slice(i, i + 50));
    }

    for (const batch of batches) {
      try {
        const data = await fetchWithKey(
          poolName,
          (key) =>
            `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&id=${batch.join(",")}&key=${key}`
        );
        for (const it of data.items || []) {
          const id = it.id;
          const snippet = it.snippet || {};
          const content = it.contentDetails || {};
          const stats = it.statistics || {};
          const status = it.status || {};
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
            channelTitle: snippet.channelTitle || snippet.videoOwnerChannelTitle || "",
            thumbnail: thumb,
            duration,
            viewCount,
            publishedAt: snippet.publishedAt || "",
            description: snippet.description || "",
            embeddable: status.embeddable !== false,
            isMadeForKids: Boolean(status.madeForKids || status.selfDeclaredMadeForKids),
          });
        }
      } catch (err) {
        console.warn(`[Vite Dev YouTube][${poolName}] Error fetching video details batch:`, err);
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

        // 1. /api/youtube/trending (Pool A: Song Discovery)
        if (pathname === "/api/youtube/trending" || pathname === "/api/trending") {
          const region = urlObj.searchParams.get("region") || "BD";
          const limit = Math.min(50, Math.max(5, parseInt(urlObj.searchParams.get("limit") || "15", 10)));
          const sectionId = urlObj.searchParams.get("sectionId") || "bangla";
          const pageToken = urlObj.searchParams.get("pageToken") || "";
          const cacheKey = `trending:${region}:${limit}:${pageToken}`;

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
              "discovery",
              (key) =>
                `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&chart=mostPopular&videoCategoryId=10&regionCode=${encodeURIComponent(region)}&maxResults=50${pageParam}&key=${key}`
            );
            const items = (data.items || [])
              .map((it: any) => {
                const snippet = it.snippet || {};
                const content = it.contentDetails || {};
                const stats = it.statistics || {};
                const status = it.status || {};
                const id = it.id;
                const dur = parseIsoDuration(content.duration || "");
                const title = snippet.title || "";
                const desc = snippet.description || "";
                const embeddable = status.embeddable !== false;
                const madeForKids = Boolean(status.madeForKids || status.selfDeclaredMadeForKids);

                return {
                  id,
                  title,
                  artist: snippet.channelTitle || "",
                  thumbnail:
                    snippet.thumbnails?.maxres?.url ||
                    snippet.thumbnails?.high?.url ||
                    snippet.thumbnails?.medium?.url ||
                    `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
                  duration: dur,
                  viewCount: parseInt(stats.viewCount || "0", 10),
                  publishedAt: snippet.publishedAt || "",
                  section: sectionId,
                  embeddable,
                  madeForKids,
                  description: desc,
                };
              })
              .filter((it: any) => {
                if (!it.id || it.embeddable === false || it.madeForKids) return false;
                if (it.duration > 0 && (it.duration < 55 || it.duration > 480)) return false;
                if (isShorts(it.title, it.description, it.duration)) return false;
                return true;
              })
              .sort((a: any, b: any) => calculateScore(b) - calculateScore(a));

            const result = { items, count: items.length, nextPageToken: data.nextPageToken || null, source: "youtube_api" };
            cache.set(cacheKey, result, 1200); // 20 min TTL
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

        // 2. /api/youtube/category (Pool A: Song Discovery)
        if (pathname === "/api/youtube/category" || pathname === "/api/category") {
          const query = urlObj.searchParams.get("q") || "";
          const order = urlObj.searchParams.get("order") || "viewCount";
          const limit = Math.min(50, Math.max(5, parseInt(urlObj.searchParams.get("limit") || "15", 10)));
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
              "discovery",
              (key) =>
                `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&order=${encodeURIComponent(order)}&maxResults=50${pageParam}&key=${key}`
            );
            const videoIds = (data.items || []).map((it: any) => it.id?.videoId).filter(Boolean);
            const snippetMap = new Map<string, any>();
            for (const it of data.items || []) {
              const vid = it.id?.videoId || it.id;
              if (vid) snippetMap.set(vid, it.snippet || {});
            }
            const details = await getVideoDetails(videoIds, "discovery");

            const songs = videoIds
              .map((id: string) => {
                const d = details.get(id);
                const snip = snippetMap.get(id) || {};
                const title = d?.title || snip.title || "";
                const artist = d?.channelTitle || snip.channelTitle || snip.videoOwnerChannelTitle || "";
                const thumb =
                  d?.thumbnail ||
                  snip.thumbnails?.maxres?.url ||
                  snip.thumbnails?.high?.url ||
                  snip.thumbnails?.medium?.url ||
                  snip.thumbnails?.default?.url ||
                  `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
                const desc = d?.description || snip.description || "";
                const publishedAt = d?.publishedAt || snip.publishedAt || "";

                return {
                  id,
                  title,
                  artist,
                  thumbnail: thumb,
                  duration: d?.duration || 0,
                  viewCount: d?.viewCount || 0,
                  publishedAt,
                  section: sectionId,
                  embeddable: d?.embeddable !== false,
                  isMadeForKids: Boolean(d?.isMadeForKids),
                  description: desc,
                };
              })
              .filter((s: any) => {
                if (!s.id || s.embeddable === false || s.isMadeForKids) return false;
                if (s.duration > 0 && (s.duration < 55 || s.duration > 480)) return false;
                if (isShorts(s.title, s.description, s.duration)) return false;
                return true;
              })
              .sort((a: any, b: any) => calculateScore(b) - calculateScore(a));

            const result = { songs, nextPageToken: data.nextPageToken || null, count: songs.length };
            cache.set(cacheKey, result, 1800); // 30 min TTL
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify(result));
            return;
          } catch (err: any) {
            console.error("[Vite Dev YouTube] Category error:", err.message);
            try {
              const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
              const fallbackUrl = `https://mevo-extractor.onrender.com/api/search?q=${encodeURIComponent(query)}&limit=${limit}${pageParam}`;
              const fRes = await fetch(fallbackUrl);
              if (fRes.ok) {
                const fData = await fRes.json();
                const songs = (fData.items || []).map((it: any) => ({
                  ...it,
                  section: sectionId,
                }));
                res.setHeader("Content-Type", "application/json");
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.end(JSON.stringify({ songs, nextPageToken: fData.nextPageToken || null, count: songs.length }));
                return;
              }
            } catch {
              // fallback failed
            }
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
            return;
          }
        }

        // 3. /api/youtube/videos (Pool configurable: defaults to discovery)
        if (pathname === "/api/youtube/videos" || pathname === "/api/videos") {
          const idsParam = urlObj.searchParams.get("ids") || "";
          const poolParam: "discovery" | "search" = urlObj.searchParams.get("pool") === "search" ? "search" : "discovery";
          const videoIds = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
          try {
            const detailsMap = await getVideoDetails(videoIds, poolParam);
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

        // 4. /api/search (Routes to Pool A for discovery requests, Pool B for user searches)
        if (pathname === "/api/search") {
          const query = urlObj.searchParams.get("q") || "";
          const limit = Math.min(50, Math.max(5, parseInt(urlObj.searchParams.get("limit") || "12", 10)));
          const pageToken = urlObj.searchParams.get("pageToken") || "";
          const poolParam = urlObj.searchParams.get("pool") || "";
          const typeParam = urlObj.searchParams.get("type") || "";

          // Explicit separation: discovery features use Pool A; live user search uses Pool B
          const isDiscovery = poolParam === "discovery" || typeParam === "discovery" || typeParam === "category";
          const targetPool: "discovery" | "search" = isDiscovery ? "discovery" : "search";

          const cacheKey = `search:${targetPool}:${query}:${limit}:${pageToken}`;

          const cached = cache.get(cacheKey);
          if (cached) {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify(cached));
            return;
          }

          try {
            const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
            const searchLimit = Math.min(50, Math.max(limit * 2, 25));
            const data = await fetchWithKey(
              targetPool,
              (key) =>
                `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&maxResults=${searchLimit}${pageParam}&key=${key}`
            );
            const videoIds = (data.items || []).map((it: any) => it.id?.videoId).filter(Boolean);
            const snippetMap = new Map<string, any>();
            for (const it of data.items || []) {
              const vid = it.id?.videoId || it.id;
              if (vid) snippetMap.set(vid, it.snippet || {});
            }
            const details = await getVideoDetails(videoIds, targetPool);

            const items = videoIds
              .map((id: string) => {
                const d = details.get(id);
                const snip = snippetMap.get(id) || {};
                const title = d?.title || snip.title || "";
                const artist = d?.channelTitle || snip.channelTitle || snip.videoOwnerChannelTitle || "";
                const thumb =
                  d?.thumbnail ||
                  snip.thumbnails?.maxres?.url ||
                  snip.thumbnails?.high?.url ||
                  snip.thumbnails?.medium?.url ||
                  snip.thumbnails?.default?.url ||
                  `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
                const desc = d?.description || snip.description || "";
                const publishedAt = d?.publishedAt || snip.publishedAt || "";

                return {
                  id,
                  title,
                  artist,
                  thumbnail: thumb,
                  duration: d?.duration || 0,
                  viewCount: d?.viewCount || 0,
                  publishedAt,
                  stream_url: `/stream?id=${id}`,
                  embeddable: d?.embeddable !== false,
                  isMadeForKids: Boolean(d?.isMadeForKids),
                  description: desc,
                };
              })
              .filter((it: any) => {
                if (it.embeddable === false || it.isMadeForKids) return false;
                if (it.duration > 0 && (it.duration < 55 || it.duration > 480)) return false;
                if (isShorts(it.title, it.description, it.duration)) return false;
                return true;
              })
              .slice(0, limit);

            const result = { items, count: items.length, nextPageToken: data.nextPageToken || null, source: "youtube_api", query, pool: targetPool };
            cache.set(cacheKey, result, 7200); // 2 hour TTL
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify(result));
            return;
          } catch (err: any) {
            console.error(`[Vite Dev YouTube][${targetPool}] Search error:`, err.message);
            try {
              const pageParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
              const fallbackUrl = `https://mevo-extractor.onrender.com/api/search?q=${encodeURIComponent(query)}&limit=${limit}${pageParam}`;
              const fRes = await fetch(fallbackUrl);
              if (fRes.ok) {
                const fData = await fRes.json();
                res.setHeader("Content-Type", "application/json");
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.end(JSON.stringify(fData));
                return;
              }
            } catch {
              // fallback failed
            }
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message, pool: targetPool }));
            return;
          }
        }

        // 5a. /api/extract & /extract: YouTube video metadata & audio stream URL endpoint
        if (pathname === "/api/extract" || pathname === "/extract") {
          if (req.method === "OPTIONS") {
            res.statusCode = 204;
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Content-Type, Range");
            res.end();
            return;
          }

          let queryId =
            urlObj.searchParams.get("id") ||
            urlObj.searchParams.get("videoId") ||
            urlObj.searchParams.get("url") ||
            "";

          if (!queryId && (req.method === "POST" || req.method === "PUT")) {
            const body = await parseJsonBody(req);
            queryId = body.id || body.videoId || body.url || "";
          }

          const rawId = queryId.trim();
          const vidMatch = rawId.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/))([a-zA-Z0-9_-]{11})/);
          const vidId = vidMatch ? vidMatch[1] : rawId.replace(/^yt-/, "").trim();

          if (!vidId) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify({ error: "Missing video ID or URL" }));
            return;
          }

          try {
            const detailsMap = await getVideoDetails([vidId], "discovery");
            const details = detailsMap.get(vidId);

            const streamCacheKey = `stream:${vidId}`;
            let audioUrl = cache.get<string>(streamCacheKey);
            if (!audioUrl) {
              audioUrl = await getDirectAudioUrl(vidId);
              if (audioUrl) {
                cache.set(streamCacheKey, audioUrl, 10800);
              }
            }

            const streamPath = `/stream?id=${encodeURIComponent(vidId)}`;

            const title = details?.title || "YouTube Track";
            const artist = details?.channelTitle || "YouTube Artist";
            const duration = details?.duration || 0;
            const thumbnail = details?.thumbnail || `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`;

            const payload = {
              id: vidId,
              title,
              artist,
              duration,
              thumbnail,
              stream_url: streamPath,
              audioUrl: streamPath,
              uploader: artist,
              channelTitle: artist,
              view_count: details?.viewCount || 0,
              viewCount: details?.viewCount || 0,
              description: details?.description || "",
            };

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify(payload));
            return;
          } catch (extractErr: any) {
            console.error(`[Vite Dev YouTube] /api/extract error for ${vidId}:`, extractErr.message);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify({ error: extractErr.message || "Extraction failed" }));
            return;
          }
        }

        // 5b. /stream & /api/stream with direct server-side stream proxying (never 302 redirect to googlevideo.com)
        if (
          pathname === "/stream" ||
          pathname === "/api/stream" ||
          pathname.startsWith("/stream/") ||
          pathname.startsWith("/api/stream/")
        ) {
          if (req.method === "OPTIONS") {
            res.statusCode = 204;
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
            res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type, Accept, User-Agent");
            res.setHeader("Access-Control-Max-Age", "86400");
            res.end();
            return;
          }

          const pathId = pathname.startsWith("/api/stream/")
            ? pathname.slice("/api/stream/".length)
            : pathname.startsWith("/stream/")
            ? pathname.slice("/stream/".length)
            : "";
          const rawId = pathId || urlObj.searchParams.get("id") || urlObj.searchParams.get("videoId") || urlObj.searchParams.get("url") || "";
          const vidId = rawId.replace(/^yt-/, "").trim();
          if (!vidId) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify({ error: "Missing video ID" }));
            return;
          }

          if (req.method === "POST") {
            const streamPath = `/stream?id=${encodeURIComponent(vidId)}`;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify({ audioUrl: streamPath, stream_url: streamPath, id: vidId }));
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

          // YouTube's googlevideo CDN returns 403 Forbidden on open-ended ranges (e.g. bytes=0-) or un-ranged requests.
          // Clamp client range requests to bounded 1MB chunks so YouTube CDN always responds with 206 Partial Content.
          const rangeHeader = req.headers["range"] as string | undefined;
          let upstreamRange: string;
          const chunkSize = 1048576; // 1 MB chunk

          if (rangeHeader) {
            const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
            if (match) {
              const start = parseInt(match[1], 10) || 0;
              const clientEnd = match[2] ? parseInt(match[2], 10) : null;
              const end = clientEnd !== null ? Math.min(clientEnd, start + chunkSize - 1) : start + chunkSize - 1;
              upstreamRange = `bytes=${start}-${end}`;
            } else {
              upstreamRange = `bytes=0-${chunkSize - 1}`;
            }
          } else {
            upstreamRange = `bytes=0-${chunkSize - 1}`;
          }

          const upstreamHeaders: Record<string, string> = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Encoding": "identity;q=1, *;q=0",
            "Range": upstreamRange,
          };

          let upstreamRes: Response | null = null;

          if (audioUrl) {
            try {
              upstreamRes = await fetch(audioUrl, {
                headers: upstreamHeaders,
              });
            } catch (fetchErr: any) {
              console.warn(`[Vite Dev YouTube] Upstream initial fetch error for ${vidId}:`, fetchErr.message);
            }
          }

          // Invalidate cache and retry if upstream returned 403 Forbidden or connection failed
          if (!upstreamRes || upstreamRes.status === 403) {
            console.warn(
              `[Vite Dev YouTube] Upstream returned ${upstreamRes ? upstreamRes.status : "error"} for ${vidId}. Invalidating cache and re-deciphering fresh signature...`
            );
            cache.set(streamCacheKey, null, 0);
            audioUrl = await getDirectAudioUrl(vidId, true);
            if (audioUrl) {
              cache.set(streamCacheKey, audioUrl, 10800);
              try {
                upstreamRes = await fetch(audioUrl, {
                  headers: upstreamHeaders,
                });
              } catch (retryErr: any) {
                console.warn(`[Vite Dev YouTube] Upstream retry fetch error for ${vidId}:`, retryErr.message);
              }
            }
          }

          // Fallback to Render microservice if direct YouTube stream is unavailable or 403
          if (!upstreamRes || upstreamRes.status >= 400) {
            console.warn(
              `[Vite Dev YouTube] Local solver stream unavailable (status ${upstreamRes?.status}). Proxying server-side from Render fallback...`
            );
            const renderBase = process.env.VITE_EXTRACTOR_URL || "https://mevo-extractor.onrender.com";
            const fallbackUrl = `${renderBase}/stream?id=${encodeURIComponent(vidId)}`;
            try {
              upstreamRes = await fetch(fallbackUrl, {
                headers: upstreamHeaders,
              });
            } catch (fallbackErr: any) {
              console.error(`[Vite Dev YouTube] Render fallback error for ${vidId}:`, fallbackErr.message);
            }
          }

          // Pipe audio stream server-side to client (NEVER 302 redirect directly to googlevideo.com)
          if (upstreamRes && upstreamRes.ok) {
            res.statusCode = upstreamRes.status;
            res.setHeader("Content-Type", upstreamRes.headers.get("content-type") || "audio/mp4");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type, Accept, User-Agent");
            res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
            res.setHeader("Accept-Ranges", "bytes");
            res.setHeader("Cache-Control", "public, max-age=10800");

            const contentRange = upstreamRes.headers.get("content-range");
            if (contentRange) res.setHeader("Content-Range", contentRange);
            const contentLength = upstreamRes.headers.get("content-length");
            if (contentLength) res.setHeader("Content-Length", contentLength);

            if (req.method === "HEAD") {
              res.end();
              return;
            }

            if (upstreamRes.body) {
              const reader = upstreamRes.body.getReader();
              let isClosed = false;
              req.on("close", () => {
                isClosed = true;
                reader.cancel().catch(() => {});
              });

              try {
                while (!isClosed) {
                  const { done, value } = await reader.read();
                  if (done || isClosed) break;
                  res.write(Buffer.from(value));
                }
              } catch {
                // Client closed stream connection
              } finally {
                if (!res.writableEnded) {
                  res.end();
                }
              }
              return;
            }
          }

          // If everything fails, return 502 Bad Gateway instead of 403 or 302
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(JSON.stringify({ error: "Audio stream unavailable", videoId: vidId }));
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

        // 7. /api/lyrics & /api/lyrics/youtube (Multi-tier synced & aligned lyrics pipeline)
        if (pathname === "/api/lyrics" || pathname === "/api/lyrics/youtube") {
          const videoId = (urlObj.searchParams.get("videoId") || urlObj.searchParams.get("id") || "").replace(/^yt-/, "").trim();
          const title = urlObj.searchParams.get("title") || "";
          const artist = urlObj.searchParams.get("artist") || "";
          const duration = parseFloat(urlObj.searchParams.get("duration") || "0") || 0;

          if (!videoId && !title) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Missing videoId or title" }));
            return;
          }

          const lyricsCacheKey = `lyrics:${videoId || title}`;
          const cachedLyrics = cache.get(lyricsCacheKey);
          if (cachedLyrics) {
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify(cachedLyrics));
            return;
          }

          try {
            const cleanT = cleanSongTitle(title);
            const cleanA = artist.replace(/\s*-\s*topic$/i, "").trim();

            // Tier 1: Multi-query LRCLIB synced lyrics
            const searchQueries = [
              cleanA && cleanA !== "Unknown Artist" ? `${cleanT} ${cleanA}` : cleanT,
              cleanA.includes(",") ? `${cleanT} ${cleanA.split(",")[0].trim()}` : "",
              cleanA.includes("&") ? `${cleanT} ${cleanA.split("&")[0].trim()}` : "",
              cleanT,
            ].filter(Boolean);

            let syncedLines: any[] = [];
            let plainLyricsText = "";

            for (const q of searchQueries) {
              try {
                const lrcRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
                  headers: { "User-Agent": "MevoMusic/1.0" },
                  signal: AbortSignal.timeout(3000),
                });
                if (lrcRes.ok) {
                  const data = await lrcRes.json();
                  if (Array.isArray(data) && data.length > 0) {
                    const withSynced = data.find((r: any) => r.syncedLyrics && r.syncedLyrics.trim().length > 0);
                    if (withSynced) {
                      syncedLines = parseLrc(withSynced.syncedLyrics);
                      if (syncedLines.length > 0) break;
                    }
                    if (!plainLyricsText) {
                      const withPlain = data.find((r: any) => r.plainLyrics && r.plainLyrics.trim().length > 0);
                      if (withPlain) plainLyricsText = withPlain.plainLyrics;
                    }
                  }
                }
              } catch {
                // try next query
              }
            }

            if (syncedLines.length > 0) {
              const processed = {
                source: "lrclib",
                lines: processLyricsLines(syncedLines),
              };
              cache.set(lyricsCacheKey, processed, 86400); // 24-hr TTL
              res.setHeader("Content-Type", "application/json");
              res.setHeader("Access-Control-Allow-Origin", "*");
              res.end(JSON.stringify(processed));
              return;
            }

            // Tier 2: Check YouTube Video Description for lyrics text
            if (!plainLyricsText && videoId) {
              try {
                const details = await getVideoDetails([videoId], "discovery");
                const d = details.get(videoId);
                if (d && d.description) {
                  const descMatch = d.description.match(/(?:lyrics|song lyrics|lyrics\s*:\s*|গান\s*:\s*|কথা\s*:\s*|बोल\s*:\s*)([\s\S]*?)(?=(?:music\s*label|audio\s*label|label\s*:|singer\s*:|composer\s*:|director|producer|stream|listen|available|itunes|spotify|http|#|\n{3,}|$))/i);
                  if (descMatch && descMatch[1]) {
                    const candidateLines = descMatch[1]
                      .split(/\r?\n/)
                      .map((l: string) => l.trim())
                      .filter((l: string) => l.length > 0 && !/^(lyrics|written by|singer|composer|music)/i.test(l));
                    if (candidateLines.length >= 4) {
                      plainLyricsText = candidateLines.join("\n");
                    }
                  }
                }
              } catch {
                // ignore
              }
            }

            // Tier 3: Audio-Guided Alignment on Plain Lyrics
            if (plainLyricsText) {
              const aligned = alignPlainLyrics(plainLyricsText, duration || 210);
              if (aligned.length > 0) {
                const processed = {
                  source: "aligned",
                  lines: processLyricsLines(aligned),
                };
                cache.set(lyricsCacheKey, processed, 86400);
                res.setHeader("Content-Type", "application/json");
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.end(JSON.stringify(processed));
                return;
              }
            }
          } catch (err: any) {
            console.warn("[Vite Dev YouTube] Lyrics handler error:", err.message);
          }

          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(JSON.stringify({ source: "none", lines: [] }));
          return;
        }

        // 8. /health and /api/health (Reports dual-pool health & quota status)
        if (pathname === "/health" || pathname === "/api/health") {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.end(JSON.stringify({ status: "online", ...poolManager.getStatus() }));
          return;
        }

        next();
      });
    },
  };
}
