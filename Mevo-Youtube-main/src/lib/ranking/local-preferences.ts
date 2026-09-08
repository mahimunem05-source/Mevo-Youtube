/**
 * Anonymous, device-local listening preferences.
 *
 * No account, no cloud profile, no permanent user-history table. Everything
 * lives in this browser's localStorage and every read is defensive: a missing,
 * cleared or corrupted store simply degrades to the global ranking.
 */

import { EMPTY_PREFERENCE_PROFILE, type LocalPreferenceProfile, type RankableSong } from "./types";

const PREFERENCE_STORAGE_KEY = "mevo-local-preferences-v1";
/** Keeps the profile small and lets taste drift over time. */
const MAX_KEYS_PER_FACET = 40;
const DECAY_AFTER_DAYS = 30;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

function sanitizeCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, number> = {};

  for (const [key, count] of Object.entries(value as Record<string, unknown>)) {
    const numeric = Number(count);
    if (key && Number.isFinite(numeric) && numeric > 0) {
      result[key] = numeric;
    }
  }

  return result;
}

/** Never throws — a cleared or broken localStorage returns an empty profile. */
export function readLocalPreferences(): LocalPreferenceProfile {
  if (!isBrowser()) return EMPTY_PREFERENCE_PROFILE;

  try {
    const raw = window.localStorage.getItem(PREFERENCE_STORAGE_KEY);
    if (!raw) return EMPTY_PREFERENCE_PROFILE;

    const parsed = JSON.parse(raw) as Partial<LocalPreferenceProfile>;

    return {
      artists: sanitizeCounts(parsed.artists),
      genres: sanitizeCounts(parsed.genres),
      sections: sanitizeCounts(parsed.sections),
      albums: sanitizeCounts(parsed.albums),
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return EMPTY_PREFERENCE_PROFILE;
  }
}

function trimFacet(counts: Record<string, number>): Record<string, number> {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, MAX_KEYS_PER_FACET));
}

function decayFacet(counts: Record<string, number>, factor: number): Record<string, number> {
  if (factor >= 1) return counts;

  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(counts)) {
    const decayed = value * factor;
    if (decayed >= 0.2) result[key] = Number(decayed.toFixed(3));
  }
  return result;
}

function writeProfile(profile: LocalPreferenceProfile): void {
  if (!isBrowser()) return;

  try {
    window.localStorage.setItem(PREFERENCE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* Storage full / disabled / private mode — ranking stays global. */
  }
}

/**
 * Records one *valid* listen against the device profile. Weight lets a
 * completed listen count for more than a bare valid play.
 */
export function recordLocalPreference(song: RankableSong, weight = 1): void {
  if (!isBrowser()) return;

  const current = readLocalPreferences();
  const ageDays = current.updatedAt ? (Date.now() - current.updatedAt) / 86_400_000 : 0;
  const decay = ageDays > DECAY_AFTER_DAYS ? 0.8 : 1;

  const next: LocalPreferenceProfile = {
    artists: decayFacet(current.artists, decay),
    genres: decayFacet(current.genres, decay),
    sections: decayFacet(current.sections, decay),
    albums: decayFacet(current.albums, decay),
    updatedAt: Date.now(),
  };

  const facets: Array<[keyof LocalPreferenceProfile, string]> = [
    ["artists", normalizeKey(song.artist)],
    ["genres", normalizeKey(song.genre)],
    ["sections", normalizeKey(song.section)],
    ["albums", normalizeKey(song.album)],
  ];

  for (const [facet, key] of facets) {
    if (!key || facet === "updatedAt") continue;
    const bucket = next[facet] as Record<string, number>;
    bucket[key] = (bucket[key] ?? 0) + weight;
  }

  next.artists = trimFacet(next.artists);
  next.genres = trimFacet(next.genres);
  next.sections = trimFacet(next.sections);
  next.albums = trimFacet(next.albums);

  writeProfile(next);
}

export function clearLocalPreferences(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(PREFERENCE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function facetAffinity(counts: Record<string, number>, key: string): number {
  if (!key) return 0;
  const value = counts[key];
  if (!value) return 0;

  const max = Math.max(...Object.values(counts));
  if (!Number.isFinite(max) || max <= 0) return 0;

  return Math.min(1, value / max);
}

/**
 * 0..1 match between a song and this device's anonymous taste profile.
 * Returns 0 whenever there is no usable profile — i.e. global ranking only.
 */
export function localPreferenceScore(song: RankableSong, profile: LocalPreferenceProfile): number {
  const artist = facetAffinity(profile.artists, normalizeKey(song.artist));
  const genre = facetAffinity(profile.genres, normalizeKey(song.genre));
  const section = facetAffinity(profile.sections, normalizeKey(song.section));
  const album = facetAffinity(profile.albums, normalizeKey(song.album));

  return Math.min(1, artist * 0.4 + genre * 0.3 + section * 0.2 + album * 0.1);
}
