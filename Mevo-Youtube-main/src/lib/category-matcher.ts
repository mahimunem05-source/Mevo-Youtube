/**
 * Smart Category Matching Engine & Persistent Prepending Store
 * Analyzes track metadata (title, artist, channel, genre keywords) and matches it to
 * the appropriate homepage category with instant cache prepending.
 */

import type { SectionId, Song } from "@/data/songs";
import { normalizeYouTubeSong, type YouTubeSearchResult } from "@/services/youtube";
import { getYouTubeStreamUrl } from "@/lib/extractor";
import { playbackEvents } from "@/lib/playback-events";

const PREPENDED_SECTIONS_STORAGE_KEY = "mevo_user_prepended_sections";

export interface MatchedCategory {
  id: string; // "bengal-echo" | "hindi-reverie" | "english-essence" | "boost-aura" | "sonic-world"
  title: string; // "Bengal Echo" | "Hindi Reverie" | "English Essence" | "Boost Aura" | "Sonic World"
  sectionId: SectionId; // "bangla" | "hindi" | "english" | "boost-aura" | "global"
}

export function detectTrackCategory(
  title: string,
  artist: string = "",
  channel: string = "",
): MatchedCategory {
  const combined = `${title} ${artist} ${channel}`.toLowerCase();

  // 1. Bangla detection (Bengali Unicode range \u0980-\u09FF or common Bangla artists/keywords)
  if (
    /[\u0980-\u09FF]/.test(combined) ||
    /\b(?:bangla|bengali|rabindra|nazrul|lalon|artcell|warfaze|aurthohin|shironamhin|bappa|tahsan|minar|habib|arifin|somlata|anupam|fossils|cactus|james|ayub bachchu|nagar baul|miles|shunno|chirkutt|meghdol|asheq|papon|shreya|arnob|kaler gaan|baul|bhatiyali)\b/i.test(
      combined,
    )
  ) {
    return {
      id: "bengal-echo",
      title: "Bengal Echo",
      sectionId: "bangla",
    };
  }

  // 2. Boost Aura / Authentic Phonk detection
  if (
    /\b(?:drift phonk|brazilian phonk|memphis phonk|wave phonk|phonk|montagem|kordhell|interworld|dxrk|dvrst|hensonn|shadxwbxrn|gvescx|cowbell|hxvry|plphonk|automotivo|funk bolha)\b/i.test(
      combined,
    )
  ) {
    return {
      id: "boost-aura",
      title: "Aura Phonk",
      sectionId: "boost-aura",
    };
  }

  // 3. Hindi detection (Devanagari Unicode range \u0900-\u097F or Hindi/Bollywood artists/keywords)
  if (
    /[\u0900-\u097F]/.test(combined) ||
    /\b(?:hindi|bollywood|arijit|arijit singh|shreya ghoshal|pritam|atif|atif aslam|jubin|jubin nautiyal|neha kakkar|badshah|vishal|mishra|armaan malik|darshan raval|t-series|zee music|yash raj|sonu nigam|alka yagnik|kumar sanu|kishore|lata|sunidhi|sid sriram|anuv jain|jasleen|mohit chauhan|rahat|nusrat|kk|yo yo honey|king|diljit|guru randhawa|b praak)\b/i.test(
      combined,
    )
  ) {
    return {
      id: "hindi-reverie",
      title: "Hindi Reverie",
      sectionId: "hindi",
    };
  }

  // 4. Sonic World: International Languages ONLY (K-Pop, J-Pop, Latin, Afrobeats, etc.)
  // Strictly non-Bangla, non-Hindi, and non-English
  if (
    /[\uAC00-\uD7AF\u3040-\u30FF\u4E00-\u9FAF]/.test(combined) ||
    /\b(?:kpop|k-pop|bts|blackpink|newjeans|stray kids|twice|seventeen|jpop|j-pop|yoasobi|kenshi yonezu|reggaeton|bad bunny|rosalia|karol g|peso pluma|afrobeats|burna boy|rema|ayra starr|wizkid|asake|tems|aya nakamura|stromae)\b/i.test(
      combined,
    )
  ) {
    return {
      id: "sonic-world",
      title: "Sonic World",
      sectionId: "global",
    };
  }

  // 5. Default / English Mainstream Pop
  return {
    id: "english-essence",
    title: "English Essence",
    sectionId: "english",
  };
}

/** Converts a YouTube search item into a playable Unified Song */
export function youTubeResultToSong(
  video: YouTubeSearchResult,
  category?: MatchedCategory,
): Song {
  const cat = category || detectTrackCategory(video.title, video.channel);
  return normalizeYouTubeSong(
    {
      id: video.id,
      title: video.title,
      channelTitle: video.channel,
      thumbnail: video.thumbnail,
      duration: video.duration,
      viewCount: video.viewCount,
      publishedAt: video.publishedAt,
    },
    cat.sectionId,
    cat.title
  );
}

/** Reads all persistent user-prepended tracks from localStorage */
export function getPrependedTracks(): Record<string, Song[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PREPENDED_SECTIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

/** Gets persistent prepended tracks for a specific section (e.g. "hindi-reverie") */
export function getPrependedTracksForSection(categoryId: string): Song[] {
  const all = getPrependedTracks();
  return Array.isArray(all[categoryId]) ? all[categoryId] : [];
}

/**
 * Prepends a song directly to index 0 of the target category.
 * Prevents duplication if already present at index 0, persists in localStorage,
 * and emits a SECTION_PREPENDED event to immediately notify listeners.
 */
export function prependTrackToSection(categoryId: string, song: Song): Song[] {
  if (!categoryId || !song || !song.id) return [];

  const all = getPrependedTracks();
  const currentList = Array.isArray(all[categoryId]) ? all[categoryId] : [];

  // If song is already at index 0, don't duplicate
  if (currentList.length > 0 && currentList[0].id === song.id) {
    return currentList;
  }

  // Filter out any existing instance and insert at index 0
  const filtered = currentList.filter((s) => s.id !== song.id);
  const updated = [song, ...filtered];
  all[categoryId] = updated;

  try {
    localStorage.setItem(PREPENDED_SECTIONS_STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn("Could not save prepended track:", e);
  }

  // Emit event to update all active observers in real time
  playbackEvents.emit("SECTION_PREPENDED", { categoryId, song });

  return updated;
}

/**
 * Merges prepended tracks at the very beginning (index 0) of fetched category tracks,
 * ensuring prepended tracks stay pinned at the top without duplicate entries.
 */
export function mergePrependedTracks(categoryId: string, fetchedSongs: Song[]): Song[] {
  const prepended = getPrependedTracksForSection(categoryId);
  if (prepended.length === 0) return fetchedSongs;

  const prependedIds = new Set(prepended.map((s) => s.id));
  const remaining = fetchedSongs.filter((s) => !prependedIds.has(s.id));

  return [...prepended, ...remaining];
}
