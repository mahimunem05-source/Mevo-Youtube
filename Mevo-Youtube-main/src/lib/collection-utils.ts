import type { Song, SectionId } from "@/data/songs";

/** URL-safe slug. Keeps Unicode letters/numbers (Bengali, etc.) intact. */
export function slugify(value: string): string {
  const normalized = (value ?? "").normalize("NFKC").trim().toLowerCase();

  if (!normalized) {
    return "unknown";
  }

  const slug = normalized
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "unknown";
}

export function shuffleArray<T>(items: readonly T[]): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

export function sumDuration(songs: readonly Song[]): number {
  return songs.reduce((total, song) => total + (song.duration || 0), 0);
}

/** Formats total seconds into Apple Music / Spotify style runtime string (e.g. "1 hr 14 min" or "42 min 18 sec") */
export function formatAlbumDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0 min";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
  }
  return remainingSeconds > 0 ? `${minutes} min ${remainingSeconds} sec` : `${minutes} min`;
}

/**
 * Sanitizes noisy YouTube artist / channel names.
 * Removes common channel suffixes like "- Topic", "VEVO", "Official", etc.
 */
export function cleanArtistName(value: string | null | undefined): string {
  if (!value) return "Unknown Artist";

  let name = value.trim();

  // Strip common noisy suffixes and channel annotations
  name = name
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\s*vevo$/i, "")
    .replace(/\s*official\s*(?:channel|music|video|audio|media|records)?$/i, "")
    .replace(/\s*records$/i, "")
    .replace(/\s*entertainment$/i, "")
    .replace(/\s*productions?$/i, "")
    .replace(/\s*tv$/i, "")
    .replace(/\s*hd$/i, "")
    .replace(/[\(\[\{].*?(?:official|audio|video|lyrics|hd|4k|remastered).*?[\)\]\}]/gi, "")
    .replace(/^[\s,_•|-]+|[\s,_•|-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return name || "Unknown Artist";
}

/**
 * Extracts multiple artists from collaboration strings like "Arijit Singh, Shreya Ghoshal"
 * or "Alan Walker feat. Ava Max"
 */
export function extractArtistNames(rawArtist: string): string[] {
  const clean = cleanArtistName(rawArtist);
  if (!clean || clean === "Unknown Artist") return ["Unknown Artist"];

  // Split on collaboration delimiters
  const parts = clean
    .split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bfeaturing\b|\bx\b|\bwith\b|\/|\|)\s*/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 1 && !/^(official|topic|vevo|audio|records)$/i.test(p));

  return parts.length > 0 ? parts : [clean];
}

function cleanGroupName(value: string | null | undefined, fallback: string): string {
  const cleaned = (value ?? "")
    .replace(/^[\s,_]+|[\s,_]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

/** Disambiguates slug collisions (two different names slugifying to the same string). */
function withUniqueSlugs<T extends { slug: string }>(groups: T[]): T[] {
  const seen = new Map<string, number>();

  return groups.map((group) => {
    const count = seen.get(group.slug) ?? 0;
    seen.set(group.slug, count + 1);

    if (count === 0) {
      return group;
    }

    return { ...group, slug: `${group.slug}-${count + 1}` };
  });
}

export interface AlbumGroup {
  key: string;
  slug: string;
  name: string;
  artist: string;
  year: number | null;
  cover: string;
  sectionId?: SectionId | null;
  badge?: string;
  description?: string;
  tracks: Song[];
}

export interface CustomAlbumMetadata {
  id?: string;
  slug: string;
  title: string;
  cover_image?: string | null;
  release_date?: string | null;
  songIds?: string[];
}

/** Curated Studio Edition Category Albums */
const SECTION_STUDIO_EDITIONS: Record<
  string,
  { name: string; sectionId: SectionId; badge: string; description: string }
> = {
  bangla: {
    name: "Bengal Echo: Studio Master Vol. 1",
    sectionId: "bangla",
    badge: "Studio Master",
    description: "The definitive high-fidelity Bengali anthology and rooftop melodies.",
  },
  hindi: {
    name: "Hindi Reverie: Midnight Sessions",
    sectionId: "hindi",
    badge: "Midnight Sessions",
    description: "Dreamlike Bollywood acoustic and timeless late-night reveries.",
  },
  english: {
    name: "English Essence: Billboard Edition",
    sectionId: "english",
    badge: "Billboard Edition",
    description: "Iconic global pop, R&B, and international chart toppers.",
  },
  "boost-aura": {
    name: "Boost Aura: Drift & Phonk Archives",
    sectionId: "boost-aura",
    badge: "Phonk Archives",
    description: "Heavy 808 bass, midnight drift phonk, and limitless momentum.",
  },
  global: {
    name: "Worldwave: Global Sonic Anthology",
    sectionId: "global",
    badge: "Sonic Anthology",
    description: "High-octane K-Pop, Latin rhythms, Afrobeat, and global anthems.",
  },
  favourite: {
    name: "Mahi Edition: Personal Vault",
    sectionId: "favourite",
    badge: "Personal Vault",
    description: "Mastered high-fidelity selections personally chosen for pure refinement.",
  },
};

/**
 * Spotify / Apple Music Style Dynamic Album Engine.
 * Single tracks (1 track) are NEVER rendered as isolated albums.
 * Automatically assembles Studio Editions, Artist EPs, and Multi-Track Soundtracks.
 */
export function groupSongsByAlbum(
  songs: readonly Song[],
  customAlbums: readonly CustomAlbumMetadata[] = [],
): AlbumGroup[] {
  const groups = new Map<string, AlbumGroup>();

  // 1. Initialise Category Studio Editions for multi-track aggregation
  for (const [secKey, meta] of Object.entries(SECTION_STUDIO_EDITIONS)) {
    const key = `studio:${secKey}`;
    groups.set(key, {
      key,
      slug: slugify(meta.name),
      name: meta.name,
      artist: "Various Artists",
      year: new Date().getFullYear(),
      cover: "",
      sectionId: meta.sectionId,
      badge: meta.badge,
      description: meta.description,
      tracks: [],
    });
  }

  // 2. Register Custom Admin Albums if >= 2 tracks
  if (customAlbums.length > 0) {
    const songById = new Map(songs.map((s) => [s.id, s]));

    for (const ca of customAlbums) {
      const tracks = (ca.songIds || [])
        .map((id) => songById.get(id))
        .filter((song): song is Song => Boolean(song));

      if (tracks.length >= 2 || (tracks.length > 0 && ca.title)) {
        const key = `custom:${ca.slug || slugify(ca.title)}`;
        const year = ca.release_date ? new Date(ca.release_date).getFullYear() : null;

        groups.set(key, {
          key,
          slug: ca.slug || slugify(ca.title),
          name: ca.title,
          artist: tracks[0]?.artist ?? "Various Artists",
          year: Number.isFinite(year) ? year : new Date().getFullYear(),
          cover: ca.cover_image || tracks[0]?.cover || "",
          badge: "Studio Edition",
          description: "Curated studio release.",
          tracks,
        });
      }
    }
  }

  // 3. Track explicit multi-track albums vs single tracks
  const explicitAlbumMap = new Map<string, Song[]>();
  const artistTrackMap = new Map<string, Song[]>();

  for (const song of songs) {
    // Add to Category Studio Edition
    const studioKey = `studio:${song.section || "global"}`;
    const studioGroup = groups.get(studioKey);
    if (studioGroup) {
      if (!studioGroup.tracks.some((t) => t.id === song.id)) {
        studioGroup.tracks.push(song);
        if (!studioGroup.cover && song.cover) {
          studioGroup.cover = song.cover;
        }
      }
    }

    // Group by explicit album if valid
    const rawAlbum = (song.album ?? "").trim();
    const isGeneric =
      !rawAlbum ||
      /^singles?$/i.test(rawAlbum) ||
      /^youtube(?:\s+stream)?$/i.test(rawAlbum) ||
      /^unknown(?:\s+album)?$/i.test(rawAlbum);

    if (!isGeneric) {
      const cleanName = cleanGroupName(rawAlbum, "Singles");
      const list = explicitAlbumMap.get(cleanName) || [];
      if (!list.some((t) => t.id === song.id)) {
        list.push(song);
      }
      explicitAlbumMap.set(cleanName, list);
    }

    // Group by cleaned artist to assemble Artist Multi-Track EPs
    const cleanedArtist = cleanArtistName(song.artist);
    if (cleanedArtist && cleanedArtist !== "Unknown Artist") {
      const list = artistTrackMap.get(cleanedArtist) || [];
      if (!list.some((t) => t.id === song.id)) {
        list.push(song);
      }
      artistTrackMap.set(cleanedArtist, list);
    }
  }

  // 4. Create Explicit Multi-Track Albums (Only if >= 2 tracks)
  for (const [albumName, trackList] of explicitAlbumMap.entries()) {
    if (trackList.length >= 2) {
      const key = `album:${albumName.toLowerCase()}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          slug: slugify(albumName),
          name: albumName,
          artist: trackList[0]?.artist ?? "Various Artists",
          year: trackList[0]?.year ?? new Date().getFullYear(),
          cover: trackList[0]?.cover ?? "",
          sectionId: trackList[0]?.section,
          badge: "Studio Album",
          description: `Full studio album by ${cleanArtistName(trackList[0]?.artist)}.`,
          tracks: trackList,
        });
      }
    }
  }

  // 5. Create Artist Multi-Track EPs (For artists with >= 3 tracks)
  for (const [artistName, trackList] of artistTrackMap.entries()) {
    if (trackList.length >= 3) {
      const epName = `${artistName}: The Essentials`;
      const key = `artist-ep:${artistName.toLowerCase()}`;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          slug: slugify(epName),
          name: epName,
          artist: artistName,
          year: trackList[0]?.year ?? new Date().getFullYear(),
          cover: trackList[0]?.cover ?? "",
          sectionId: trackList[0]?.section,
          badge: "Artist EP",
          description: `Master tape collection of ${artistName}'s top catalogue records.`,
          tracks: trackList,
        });
      }
    }
  }

  // 6. Strict Multi-Track Filter: Minimum 2 tracks per album
  const validAlbums = Array.from(groups.values()).filter((album) => album.tracks.length >= 2);

  // Sort: Studio editions first, then by track count desc
  const sorted = validAlbums.sort((a, b) => {
    const isAStudio = a.key.startsWith("studio:");
    const isBStudio = b.key.startsWith("studio:");
    if (isAStudio && !isBStudio) return -1;
    if (!isAStudio && isBStudio) return 1;
    return b.tracks.length - a.tracks.length || a.name.localeCompare(b.name);
  });

  return withUniqueSlugs(sorted);
}

export interface ArtistGroup {
  key: string;
  slug: string;
  name: string;
  cover: string | null;
  is_verified?: boolean;
  tracks: Song[];
  trackCount: number;
  totalDuration: number;
}

export interface CustomArtistMetadata {
  name: string;
  image_url?: string | null;
  is_verified?: boolean;
}

/**
 * Groups songs by sanitized artist names.
 * Uses highest quality cover art and sorts by total track count / popularity.
 */
export function groupSongsByArtist(
  songs: readonly Song[],
  customArtists: readonly CustomArtistMetadata[] = [],
): ArtistGroup[] {
  const groups = new Map<string, ArtistGroup>();

  const customMap = new Map<string, CustomArtistMetadata>();
  for (const item of customArtists) {
    if (item?.name) {
      customMap.set(item.name.trim().toLowerCase(), item);
    }
  }

  for (const song of songs) {
    const cleanedPrimary = cleanArtistName(song.artist);
    const artistsInSong = extractArtistNames(song.artist);

    // Ensure the primary cleaned name is always included
    const allArtistsForSong = Array.from(new Set([cleanedPrimary, ...artistsInSong]));

    for (const artistName of allArtistsForSong) {
      if (!artistName || artistName === "Unknown Artist" || artistName.length < 2) continue;

      const key = artistName.toLocaleLowerCase();
      const existing = groups.get(key);
      const custom = customMap.get(key);

      if (existing) {
        if (!existing.tracks.some((t) => t.id === song.id)) {
          existing.tracks.push(song);
          existing.trackCount = existing.tracks.length;
          existing.totalDuration += song.duration || 0;
        }
        if (custom?.image_url) {
          existing.cover = custom.image_url;
        } else if (!existing.cover && song.cover) {
          existing.cover = song.cover;
        }
        if (custom?.is_verified !== undefined) {
          existing.is_verified = custom.is_verified;
        }
        continue;
      }

      const resolvedCover = custom?.image_url || song.cover || null;
      const isVerified = Boolean(custom?.is_verified);

      groups.set(key, {
        key,
        slug: slugify(artistName),
        name: artistName,
        cover: resolvedCover,
        is_verified: isVerified,
        tracks: [song],
        trackCount: 1,
        totalDuration: song.duration || 0,
      });
    }
  }

  // Apply custom metadata overrides if any
  for (const [key, group] of groups.entries()) {
    const custom = customMap.get(key);
    if (custom) {
      if (custom.image_url) {
        group.cover = custom.image_url;
      }
      if (custom.is_verified !== undefined) {
        group.is_verified = Boolean(custom.is_verified);
      }
    }
  }

  // Sort artists by track count descending, then total duration, then name
  const sorted = Array.from(groups.values())
    .filter((g) => g.tracks.length > 0)
    .sort((a, b) => b.tracks.length - a.tracks.length || b.totalDuration - a.totalDuration || a.name.localeCompare(b.name));

  return withUniqueSlugs(sorted);
}

/**
 * Smart recommendation engine for Featured section rows.
 */
export function getFeaturedSongsForSection(
  sectionId: string,
  sectionSongs: readonly Song[],
  allCatalogue: readonly Song[] = [],
  trendingSongIds: Set<string> = new Set(),
  limit = 5,
): Song[] {
  if (sectionSongs.length === 0 && allCatalogue.length === 0) {
    return [];
  }

  const dateSeed = new Date().toISOString().slice(0, 10);
  const seedBase = `${sectionId}:${dateSeed}`;

  function getDeterministicScore(song: Song): number {
    let score = 0;
    if (trendingSongIds.has(song.id)) {
      score += 1000;
    }
    if (song.duration > 0) {
      score += Math.min(song.duration, 300) / 10;
    }
    if (song.year && song.year >= 2024) {
      score += 20;
    }
    let hash = 5381;
    const key = `${seedBase}:${song.id}`;
    for (let i = 0; i < key.length; i++) {
      hash = (hash * 33) ^ key.charCodeAt(i);
    }
    score += Math.abs(hash) % 100;

    return score;
  }

  const pool = sectionSongs.length > 0 ? [...sectionSongs] : [...allCatalogue];
  const sortedPool = [...pool].sort((a, b) => getDeterministicScore(b) - getDeterministicScore(a));

  const selected: Song[] = [];
  const selectedIds = new Set<string>();
  const artistCounts = new Map<string, number>();

  const totalDistinctArtists = new Set(pool.map((s) => s.artist.toLowerCase())).size;
  const maxPerArtist = totalDistinctArtists > 1 ? 2 : 999;

  for (const song of sortedPool) {
    if (selected.length >= limit) break;
    if (selectedIds.has(song.id)) continue;

    const artistKey = song.artist.toLowerCase();
    const count = artistCounts.get(artistKey) ?? 0;

    if (count < maxPerArtist) {
      selected.push(song);
      selectedIds.add(song.id);
      artistCounts.set(artistKey, count + 1);
    }
  }

  if (selected.length < limit) {
    for (const song of sortedPool) {
      if (selected.length >= limit) break;
      if (!selectedIds.has(song.id)) {
        selected.push(song);
        selectedIds.add(song.id);
      }
    }
  }

  if (selected.length < limit && allCatalogue.length > 0) {
    const sortedCatalogue = [...allCatalogue].sort(
      (a, b) => getDeterministicScore(b) - getDeterministicScore(a),
    );

    for (const song of sortedCatalogue) {
      if (selected.length >= limit) break;
      if (!selectedIds.has(song.id)) {
        selected.push(song);
        selectedIds.add(song.id);
      }
    }
  }

  return selected;
}
