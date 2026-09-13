/**
 * Persistent API Caching Service powered by Supabase & Local In-Memory Fallback
 * Provides multi-layer caching (L1 In-Memory + L2 Supabase) for YouTube API payloads.
 */

import { supabase } from "@/lib/supabase";

export type ApiCacheType = "category" | "search" | "video_details" | "stream_url";

export const API_CACHE_TTL: Record<ApiCacheType, number> = {
  category: 20 * 3600, // 20 hours in seconds
  search: 20 * 3600, // 20 hours in seconds
  video_details: 20 * 3600, // 20 hours in seconds
  stream_url: 4 * 3600, // 4 hours in seconds
};

// Fast L1 in-memory cache
const memoryL1 = new Map<string, { expiresAt: number; data: any }>();

/**
 * Retrieves cached data from L1 memory or L2 Supabase persistent cache.
 */
export async function getFromApiCache<T>(cacheKey: string): Promise<T | null> {
  if (!cacheKey) return null;

  // 1. Check L1 in-memory cache
  const l1 = memoryL1.get(cacheKey);
  if (l1) {
    if (Date.now() < l1.expiresAt) {
      return l1.data as T;
    }
    memoryL1.delete(cacheKey);
  }

  // 2. Check L2 Supabase persistent cache
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("api_cache")
      .select("data, expires_at")
      .eq("cache_key", cacheKey)
      .gt("expires_at", nowIso)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const payload = data.data as T;
    const expiresAtMs = new Date(data.expires_at).getTime();

    // Populate L1 cache for subsequent fast reads
    if (expiresAtMs > Date.now()) {
      memoryL1.set(cacheKey, {
        data: payload,
        expiresAt: expiresAtMs,
      });
    }

    return payload;
  } catch (err) {
    // Fail gracefully if table does not exist or network fails
    return null;
  }
}

/**
 * Persists data into both L1 in-memory cache and L2 Supabase persistent cache.
 */
export async function setInApiCache<T>(
  cacheKey: string,
  cacheType: ApiCacheType,
  data: T,
  ttlSeconds?: number
): Promise<boolean> {
  if (!cacheKey || data === undefined || data === null) return false;

  const ttl = ttlSeconds && ttlSeconds > 0 ? ttlSeconds : API_CACHE_TTL[cacheType] || 20 * 3600;
  const expiresAtMs = Date.now() + ttl * 1000;
  const expiresAtIso = new Date(expiresAtMs).toISOString();

  // 1. Write to L1 in-memory cache immediately
  memoryL1.set(cacheKey, {
    data,
    expiresAt: expiresAtMs,
  });

  // 2. Write to L2 Supabase persistent cache
  try {
    const { error } = await supabase.from("api_cache").upsert(
      {
        cache_key: cacheKey,
        cache_type: cacheType,
        data: data as any,
        expires_at: expiresAtIso,
      },
      { onConflict: "cache_key" }
    );

    if (error) {
      // Table may not exist yet or RLS policy pending; L1 remains valid
      return false;
    }

    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Removes an entry from both L1 and L2 cache.
 */
export async function deleteFromApiCache(cacheKey: string): Promise<void> {
  if (!cacheKey) return;
  memoryL1.delete(cacheKey);

  try {
    await supabase.from("api_cache").delete().eq("cache_key", cacheKey);
  } catch {
    // ignore
  }
}
