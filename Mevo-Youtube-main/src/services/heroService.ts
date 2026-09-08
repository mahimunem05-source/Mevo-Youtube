import { supabase } from "@/lib/supabase";
import {
  DEFAULT_HERO_SETTINGS,
  type HomeHeroSettings,
  type HeroPeriod,
  type HomeHeroSongRecord,
} from "@/types/hero";
import type { Song as PlayerSong } from "@/data/songs";
import { databaseSongToPlayerSong } from "@/lib/song-adapter";

const SETTINGS_STORAGE_KEY = "mevo-hero-settings-cache";
const DAY_SONGS_STORAGE_KEY = "mevo-hero-day-songs-cache";
const NIGHT_SONGS_STORAGE_KEY = "mevo-hero-night-songs-cache";

/**
 * Calculates current period (day or night) based on user's browser local time and configured start times.
 */
export function getCurrentHeroPeriod(settings?: HomeHeroSettings | null): {
  period: HeroPeriod;
  label: string;
} {
  try {
    const s = settings || DEFAULT_HERO_SETTINGS;
    const now = new Date();

    // Check manual override schedule if set
    if (s.manual_override_song_id && s.override_start_at && s.override_end_at) {
      const start = new Date(s.override_start_at).getTime();
      const end = new Date(s.override_end_at).getTime();
      const current = now.getTime();
      if (!isNaN(start) && !isNaN(end) && current >= start && current <= end) {
        return { period: "override", label: "Special Feature" };
      }
    }

    // Parse start times e.g. "06:00" and "18:00"
    const dayParts = (s.day_start_time || "06:00").split(":");
    const nightParts = (s.night_start_time || "18:00").split(":");

    const dayH = parseInt(dayParts[0], 10) || 6;
    const dayM = parseInt(dayParts[1], 10) || 0;
    const nightH = parseInt(nightParts[0], 10) || 18;
    const nightM = parseInt(nightParts[1], 10) || 0;

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const dayMinutes = dayH * 60 + dayM;
    const nightMinutes = nightH * 60 + nightM;

    let isDay = false;
    if (dayMinutes < nightMinutes) {
      // e.g. Day: 06:00 to 18:00
      isDay = currentMinutes >= dayMinutes && currentMinutes < nightMinutes;
    } else {
      // Overnight e.g. Day: 18:00 to 06:00
      isDay = currentMinutes >= dayMinutes || currentMinutes < nightMinutes;
    }

    if (isDay) {
      return { period: "day", label: s.day_title || "Today's Pick" };
    } else {
      return { period: "night", label: s.night_title || "Tonight's Pick" };
    }
  } catch (err) {
    console.warn("Error calculating hero period:", err);
    return { period: "day", label: "Today's Pick" };
  }
}

/**
 * Fetches hero settings from Supabase table `home_hero_settings` or returns cached/default settings.
 * If the table doesn't exist yet or errors out, silently falls back to localStorage or defaults.
 */
export async function getHeroSettings(): Promise<HomeHeroSettings> {
  const getCachedSettings = (): HomeHeroSettings => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) return JSON.parse(saved) as HomeHeroSettings;
    } catch {
      /* ignore */
    }
    return DEFAULT_HERO_SETTINGS;
  };

  try {
    const { data, error } = await supabase
      .from("home_hero_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    if (error || !data) {
      return getCachedSettings();
    }

    const settings: HomeHeroSettings = {
      ...DEFAULT_HERO_SETTINGS,
      ...data,
    };

    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
    return settings;
  } catch {
    return getCachedSettings();
  }
}

/**
 * Updates hero settings in Supabase or local storage.
 */
export async function updateHeroSettings(
  updates: Partial<HomeHeroSettings>,
): Promise<HomeHeroSettings> {
  const current = await getHeroSettings();
  const nextSettings: HomeHeroSettings = {
    ...current,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
  } catch {
    /* ignore */
  }

  try {
    const { error } = await supabase
      .from("home_hero_settings")
      .upsert(nextSettings, { onConflict: "id" });

    if (error) {
      console.warn("Could not upsert hero settings to Supabase:", error.message);
    }
  } catch (err) {
    console.warn("Supabase hero_settings update skipped:", err);
  }

  return nextSettings;
}

/**
 * Fetches manual hero songs for period ('day' | 'night' | 'override').
 * Directly queries song IDs and safely falls back without throwing or logging uncaught 400s.
 */
export async function getHeroSongsRecords(period: HeroPeriod): Promise<string[]> {
  const cacheKey = period === "day" ? DAY_SONGS_STORAGE_KEY : NIGHT_SONGS_STORAGE_KEY;

  const getCachedSongIds = (): string[] => {
    try {
      const saved = localStorage.getItem(cacheKey);
      if (saved) return JSON.parse(saved) as string[];
    } catch {
      /* ignore */
    }
    return [];
  };

  try {
    const { data, error } = await supabase.from("home_hero_songs").select("*").eq("period", period);

    if (error || !data || !Array.isArray(data) || data.length === 0) {
      return getCachedSongIds();
    }

    // Filter active items and sort by display_order if present
    const validRows = data
      .filter((item: any) => item && (item.active === undefined || item.active === true))
      .sort((a: any, b: any) => (Number(a.display_order) || 0) - (Number(b.display_order) || 0));

    const ids = validRows
      .map((d: any) => (d.song_id || d.id || "") as string)
      .filter((id) => Boolean(id && typeof id === "string"));

    if (ids.length > 0) {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(ids));
      } catch {
        /* ignore */
      }
      return ids;
    }

    return getCachedSongIds();
  } catch {
    return getCachedSongIds();
  }
}

/**
 * Sets manual hero song IDs for a period.
 */
export async function setHeroSongsForPeriod(period: HeroPeriod, songIds: string[]): Promise<void> {
  const key = period === "day" ? DAY_SONGS_STORAGE_KEY : NIGHT_SONGS_STORAGE_KEY;
  try {
    localStorage.setItem(key, JSON.stringify(songIds));
  } catch {
    /* ignore */
  }

  try {
    // Delete old records for this period
    await supabase.from("home_hero_songs").delete().eq("period", period);

    if (songIds.length > 0) {
      const records: HomeHeroSongRecord[] = songIds.map((song_id, index) => ({
        period,
        song_id,
        display_order: index,
        active: true,
        source_type: "manual",
        created_at: new Date().toISOString(),
      }));

      await supabase.from("home_hero_songs").insert(records);
    }
  } catch (err) {
    console.warn("Could not set hero songs in Supabase:", err);
  }
}

/**
 * Automatic Recommendation Engine for Hero Section:
 * Filters & ranks published songs for the Day / Night set.
 */
export function generateAutomaticHeroSongs(
  allSongs: PlayerSong[],
  trendingSongIds: Set<string>,
  period: HeroPeriod,
  limit = 5,
): PlayerSong[] {
  if (allSongs.length === 0) return [];

  // Filter valid published songs
  const validSongs = allSongs.filter((s) => s.audio && s.title);

  // Score candidate songs
  const scored = validSongs.map((song) => {
    let score = 0;
    // 1. Trending membership (+100)
    if (trendingSongIds.has(song.id)) score += 100;
    // 2. Play count / duration proxy
    if (song.duration) score += Math.min(song.duration, 300) / 10;
    // 3. Recency
    if (song.year && song.year >= 2024) score += 20;

    // 4. Period mood tuning
    const genre = (song.genre || "").toLowerCase();
    const title = (song.title || "").toLowerCase();

    if (period === "night") {
      if (
        genre.includes("lofi") ||
        genre.includes("soft") ||
        genre.includes("chill") ||
        genre.includes("acoustic") ||
        title.includes("night") ||
        title.includes("rabi") ||
        title.includes("shondha")
      ) {
        score += 50;
      }
    } else {
      // Day tuning
      if (
        genre.includes("pop") ||
        genre.includes("dance") ||
        genre.includes("rock") ||
        genre.includes("upbeat") ||
        title.includes("day")
      ) {
        score += 30;
      }
    }

    return { song, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Artist diversity: Max 2 per artist
  const selected: PlayerSong[] = [];
  const selectedIds = new Set<string>();
  const artistCounts = new Map<string, number>();

  for (const { song } of scored) {
    if (selected.length >= limit) break;
    if (!song || selectedIds.has(song.id)) continue;

    const artistKey = (song.artist || "").toLowerCase();
    const count = artistCounts.get(artistKey) ?? 0;

    if (count < 2) {
      selected.push(song);
      selectedIds.add(song.id);
      artistCounts.set(artistKey, count + 1);
    }
  }

  // Fallback if < limit
  if (selected.length < limit) {
    for (const { song } of scored) {
      if (selected.length >= limit) break;
      if (!selectedIds.has(song.id)) {
        selected.push(song);
        selectedIds.add(song.id);
      }
    }
  }

  return selected;
}
