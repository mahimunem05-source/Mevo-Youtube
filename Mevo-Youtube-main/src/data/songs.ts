import { getSongById } from "@/services/songService";

/** A playable section of the catalogue. Queue behaviour is scoped per section. */
export type SectionId = "bangla" | "favourite" | "hindi" | "english" | "global" | "boost-aura";

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number;
  duration: number;
  cover: string;
  audio: string;
  section: SectionId;
  category: string;
  trending?: boolean;
  is_explicit?: boolean;
  explicit?: boolean;
  created_at?: string;
  release_date?: string | null;
  play_count?: number;
  plays?: number;
  last_played_at?: string | null;
  bpm?: number;
}

export function isSongExplicit(song?: Song | null): boolean {
  if (!song) return false;
  if (song.is_explicit || (song as { explicit?: boolean }).explicit) return true;
  const titleLower = (song.title || "").toLowerCase();
  return (
    titleLower.includes("[explicit]") ||
    titleLower.includes("(explicit)") ||
    titleLower.endsWith(" - explicit") ||
    titleLower.endsWith(" (explicit version)")
  );
}

export function isYouTubeSong(song?: Song | null): boolean {
  if (!song) return false;
  if (
    song.id?.startsWith("yt-") ||
    song.category === "YouTube" ||
    song.album === "YouTube Stream" ||
    song.album === "YouTube"
  ) {
    return true;
  }
  if (
    song.cover &&
    (song.cover.includes("youtube.com") ||
      song.cover.includes("ytimg.com") ||
      song.cover.includes("youtu.be"))
  ) {
    return true;
  }
  if (
    song.audio &&
    (song.audio.includes("youtube") || song.audio.includes("googlevideo"))
  ) {
    return true;
  }
  return false;
}

export interface Section {
  id: SectionId;
  slug: string;
  title: string;
  subtitle: string;
  variant: "default" | "favourite";
}

/** A homepage row can also be a display-only collection such as Trending or Recently Played. */
export type DisplaySection = Omit<Section, "id"> & {
  id: SectionId | "trending" | "recently-played" | "quick-picks";
  badge?: string;
};

export const quickPicksSection: DisplaySection = {
  id: "quick-picks",
  slug: "quick-picks",
  title: "Quick Picks",
  subtitle: "Personalized mixes inspired by your listening habits",
  variant: "default",
};

export const trendingSection: DisplaySection = {
  id: "trending",
  slug: "trending",
  title: "MEVO Pulse",
  subtitle: "Real-time Official Global & Regional YouTube Trending Hits.",
  variant: "default",
};

export const recentlyPlayedSection: DisplaySection = {
  id: "recently-played",
  slug: "recently-played",
  title: "Resume Listening",
  subtitle: "Continue from where the music paused.",
  variant: "default",
};

export const sections: Section[] = [
  {
    id: "bangla",
    slug: "bangla-beats",
    title: "Bengal Echo",
    subtitle: "Official Bangla Band, Indie, Folk & Contemporary Master Tracks.",
    variant: "default",
  },
  {
    id: "favourite",
    slug: "mahis-favourite",
    title: "Mahi Select",
    subtitle: "Personally chosen. Exceptionally refined.",
    variant: "default",
  },
  {
    id: "hindi",
    slug: "soft-hindi-vibes",
    title: "Hindi Reverie",
    subtitle: "High-Quality Bollywood & Indie Hindi Official Originals.",
    variant: "default",
  },
  {
    id: "english",
    slug: "english-essence",
    title: "English Essence",
    subtitle: "Chart-topping English Pop, R&B, and Global Hits.",
    variant: "default",
  },
  {
    id: "global",
    slug: "global-tracks",
    title: "Sonic World",
    subtitle: "Ambient, Lofi, EDM & Atmospheric Classics.",
    variant: "default",
  },
  {
    id: "boost-aura",
    slug: "boost-aura",
    title: "Aura Phonk",
    subtitle: "High-velocity Phonk, Bass-boosted drift, and energetic sonic beats.",
    variant: "default",
  },
];

/** All homepage-visible display sections in one place — used to resolve See All slugs. */
export const allDisplaySections: DisplaySection[] = [
  quickPicksSection,
  trendingSection,
  ...sections,
  recentlyPlayedSection,
];

const SLUG_ALIASES: Record<string, string> = {
  "quick-picks": "quick-picks",
  "mevo-pulse": "trending",
  "bengal-echo": "bangla-beats",
  "hindi-reverie": "soft-hindi-vibes",
  "mahi-select": "mahis-favourite",
  "sonic-world": "global-tracks",
};

export function getDisplaySectionBySlug(slug: string): DisplaySection | undefined {
  const normalized = slug.trim().toLowerCase();
  const directMatch = allDisplaySections.find(
    (section) => section.slug.toLowerCase() === normalized || section.id.toLowerCase() === normalized,
  );
  if (directMatch) return directMatch;

  const aliasedSlug = SLUG_ALIASES[normalized];
  if (aliasedSlug) {
    return allDisplaySections.find((section) => section.slug.toLowerCase() === aliasedSlug.toLowerCase());
  }

  return undefined;
}

/** Identifies which collection the active queue came from. */
export type QueueSourceType =
  | "album"
  | "playlist"
  | "artist"
  | "section"
  | "trending"
  | "search"
  | "recent"
  | "single"
  | "hero"
  | "favourite";

export interface QueueSource {
  type: QueueSourceType;
  id: string;
  title: string;
}

export interface NavigationSource extends QueueSource {
  pathname: string;
  label: string;
}

/**
 * Neutral placeholder used only when an uploaded song has no cover image.
 * This is not demo album artwork and does not create a demo song/album/artist.
 */
export const DEFAULT_COVER = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs>
      <linearGradient id="background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#08140e"/>
        <stop offset="0.55" stop-color="#0c2117"/>
        <stop offset="1" stop-color="#07100c"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="45%" r="55%">
        <stop offset="0" stop-color="#28d96f" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#28d96f" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="800" height="800" rx="64" fill="url(#background)"/>
    <rect width="800" height="800" rx="64" fill="url(#glow)"/>
    <circle cx="400" cy="400" r="155" fill="none" stroke="#34e27a" stroke-opacity="0.28" stroke-width="20"/>
    <circle cx="400" cy="400" r="44" fill="#34e27a" fill-opacity="0.75"/>
    <path d="M178 430 C260 330 318 500 400 400 C480 302 548 472 630 365" fill="none" stroke="#34e27a" stroke-width="18" stroke-linecap="round" stroke-opacity="0.9"/>
  </svg>
`)}`;

/**
 * Supabase `section` values mapped to the frontend section IDs.
 *
 * The first six entries are the canonical values written by the current
 * admin dropdown (kept aligned with SONG_SECTION_OPTIONS in
 * songService.ts). The remaining entries are backward-compatible
 * aliases for rows that may have been written with an older/alternate
 * value (before a section existed as a formal admin option, or entered
 * directly in Supabase) — they are never shown anywhere, only matched.
 */
const DB_SECTION_TO_SECTION_ID: Record<string, SectionId> = {
  // Canonical values
  "bangla-beats": "bangla",
  "mahis-favourite": "favourite",
  "soft-hindi-vibes": "hindi",
  "global-tracks": "global",
  "english-essence": "english",
  "boost-aura": "boost-aura",
  // Backward-compatible aliases
  bangla: "bangla",
  "bengal-echo": "bangla",
  hindi: "hindi",
  "hindi-reverie": "hindi",
  "mahi-select": "favourite",
  "mahi-favourite": "favourite",
  global: "global",
  "sonic-world": "global",
  arabic: "global",
  phonk: "boost-aura",
};

/** Case-insensitive lookup of a raw Supabase `section` value, canonical or legacy. */
export function normalizeDbSection(rawSection: string | null | undefined): SectionId {
  const key = (rawSection ?? "").trim().toLowerCase();
  return DB_SECTION_TO_SECTION_ID[key] ?? "bangla";
}

/**
 * Whether a song counts as belonging to a given homepage section.
 *
 * For every section this is just a direct match on `song.section`.
 * Boost Aura is the one exception: for records created before the
 * Boost Aura section existed, a song tagged with the legacy
 * `genre: "Phonk"` metadata is also treated as Boost Aura content,
 * without changing that song's primary section elsewhere (e.g. it can
 * still surface in its original homepage section too).
 */
export function belongsToSection(song: Song, sectionId: SectionId): boolean {
  if (song.section === sectionId) {
    return true;
  }

  if (sectionId === "boost-aura") {
    return song.genre.trim().toLowerCase() === "phonk";
  }

  // Backward-compatible fallback only: rows created before the
  // `english-essence` section existed can still be recognised from their
  // structured English language/genre metadata.
  if (sectionId === "english") {
    return song.genre.trim().toLowerCase() === "english";
  }

  return false;
}

/**
 * Runtime-only catalogue. It starts empty so no demo songs can appear.
 * The homepage fills it with published songs loaded from Supabase. Keeping the
 * same exported array reference preserves compatibility with existing imports.
 */
export const songs: Song[] = [];

export function replaceRuntimeSongs(nextSongs: readonly Song[]): void {
  songs.splice(0, songs.length, ...nextSongs);
}

/** Synchronous lookup against the currently loaded Supabase catalogue. */
export const getSong = (id: string) => songs.find((song) => String(song.id) === String(id));

/**
 * Loads a song from the runtime catalogue first, then from Supabase.
 * No static/demo fallback is used.
 */
export async function getSongAsync(id: string): Promise<Song | undefined> {
  const cachedSong = getSong(id);

  if (cachedSong) {
    return cachedSong;
  }

  try {
    const dbSong = await getSongById(id);
    const section = normalizeDbSection(dbSong.section);
    const sectionDetails = sections.find((item) => item.id === section);
    const sourceDate = dbSong.release_date || dbSong.created_at;
    const parsedYear = sourceDate ? new Date(sourceDate).getFullYear() : Number.NaN;

    return {
      id: dbSong.id,
      title: dbSong.title,
      artist: dbSong.artist,
      album: dbSong.album?.trim() || "Singles",
      genre: dbSong.genre?.trim() || "Unknown",
      year: Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear(),
      duration: Number.isFinite(dbSong.duration) ? Math.max(0, Math.round(dbSong.duration)) : 0,
      cover: dbSong.cover_image?.trim() || DEFAULT_COVER,
      audio: dbSong.audio_file,
      section,
      category: sectionDetails?.title ?? "Music",
      trending: false,
      created_at: dbSong.created_at,
      release_date: dbSong.release_date,
      play_count: dbSong.play_count ?? 0,
      plays: dbSong.play_count ?? 0,
    } satisfies Song;
  } catch (error) {
    console.error("getSongAsync: could not load song from Supabase", error);
    return undefined;
  }
}

export const songsBySection = (section: SectionId) =>
  songs.filter((song) => song.section === section);

export const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
};

/** Case-insensitive search of the currently loaded Supabase songs only. */
export const searchSongs = (query: string, limit = 6) => {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  return songs
    .filter((song) =>
      [song.title, song.artist, song.album, song.genre, song.category].some((field) =>
        field.toLowerCase().includes(normalizedQuery),
      ),
    )
    .slice(0, limit);
};
