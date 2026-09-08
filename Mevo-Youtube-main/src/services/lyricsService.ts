import { cleanArtistName } from "@/lib/user-taste";
import { getExtractorBaseUrl } from "@/lib/extractor";

export interface LyricLine {
  time: number; // in seconds (e.g. 12.34)
  text: string;
  duration?: number;
}

export interface LyricsResult {
  source: "lrclib" | "youtube_captions" | "plain";
  language?: string;
  lines: LyricLine[];
}

const lyricsMemoryCache = new Map<string, LyricsResult | null>();

// ---------------------------------------------------------------------------
// Devanagari Phonetic Dictionaries (Hinglish Romanization)
// ---------------------------------------------------------------------------
const DEVANAGARI_VOWELS: Record<string, string> = {
  अ: "a",
  आ: "aa",
  इ: "i",
  ई: "i",
  उ: "u",
  ऊ: "u",
  ऋ: "ri",
  ए: "e",
  ऐ: "ai",
  ओ: "o",
  औ: "au",
  अं: "an",
  अः: "ah",
  ॐ: "om",
};

const DEVANAGARI_MATRAS: Record<string, string> = {
  "ा": "a",
  "ि": "i",
  "ी": "i",
  "ु": "u",
  "ू": "u",
  "ृ": "ri",
  "े": "e",
  "ै": "ai",
  "ो": "o",
  "ौ": "au",
  "ं": "n",
  "ँ": "n",
  "ः": "h",
  "्": "",
};

const DEVANAGARI_CONSONANTS: Record<string, string> = {
  क: "k",
  ख: "kh",
  ग: "g",
  घ: "gh",
  ङ: "ng",
  च: "ch",
  छ: "chh",
  ज: "j",
  झ: "jh",
  ञ: "ny",
  ट: "t",
  ठ: "th",
  ड: "d",
  ढ: "dh",
  ण: "n",
  त: "t",
  थ: "th",
  द: "d",
  ध: "dh",
  न: "n",
  प: "p",
  फ: "ph",
  ब: "b",
  भ: "bh",
  म: "m",
  य: "y",
  र: "r",
  ल: "l",
  व: "v",
  श: "sh",
  ष: "sh",
  स: "s",
  ह: "h",
  क्ष: "ksh",
  त्र: "tr",
  ज्ञ: "gy",
  श्र: "shr",
  क़: "q",
  ख़: "kh",
  ग़: "gh",
  ज़: "z",
  ड़: "r",
  ढ़: "rh",
  फ़: "f",
  "\u0958": "q",
  "\u0959": "kh",
  "\u095A": "gh",
  "\u095B": "z",
  "\u095C": "r",
  "\u095D": "rh",
  "\u095E": "f",
  "\u095F": "y",
};

/**
 * Transliterates Hindi/Devanagari script (\u0900-\u097F) into natural Roman/Hinglish alphabet.
 * Leaves Bengali script (\u0980-\u09FF), English, and all other scripts 100% UNTOUCHED in original native script.
 */
export function transliterateDevanagari(text: string): string {
  if (!text || typeof text !== "string") return text;
  // If text does NOT contain Devanagari (\u0900-\u097F), keep 100% AS-IS (e.g. Bengali \u0980-\u09FF or English)
  if (!/[\u0900-\u097F]/.test(text)) {
    return text;
  }

  // Pre-normalize nuktas
  const norm = text
    .replace(/\u0915\u093C/g, "\u0958")
    .replace(/\u0916\u093C/g, "\u0959")
    .replace(/\u0917\u093C/g, "\u095A")
    .replace(/\u091C\u093C/g, "\u095B")
    .replace(/\u0921\u093C/g, "\u095C")
    .replace(/\u0922\u093C/g, "\u095D")
    .replace(/\u092B\u093C/g, "\u095E")
    .replace(/श\u094D\u0930/g, "श्र")
    .replace(/\u093C/g, ""); // strip orphan nukta

  const words = norm.split(/(\s+|[.,!?;:'"()[\]{}]+)/);
  return words
    .map((word) => {
      if (!/[\u0900-\u097F]/.test(word)) return word;

      let out = "";
      const chars = Array.from(word);
      for (let i = 0; i < chars.length; i++) {
        const c = chars[i];
        const next = chars[i + 1];

        if (DEVANAGARI_VOWELS[c]) {
          out += DEVANAGARI_VOWELS[c];
        } else if (DEVANAGARI_CONSONANTS[c]) {
          const base = DEVANAGARI_CONSONANTS[c];
          if (next === "्") {
            out += base;
            i++; // skip virama / halant
          } else if (DEVANAGARI_MATRAS[next] !== undefined) {
            out += base + DEVANAGARI_MATRAS[next];
            i++; // skip matra
          } else {
            // Schwa: don't add trailing 'a' at end of word
            const isEnd = i === chars.length - 1 || !/[\u0900-\u097F]/.test(next);
            out += isEnd ? base : base + "a";
          }
        } else if (DEVANAGARI_MATRAS[c] !== undefined) {
          out += DEVANAGARI_MATRAS[c];
        } else {
          out += c;
        }
      }
      return out;
    })
    .join("");
}

export function processLyricsLines(lines: LyricLine[]): LyricLine[] {
  return lines.map((line) => ({
    ...line,
    text: transliterateDevanagari(line.text),
  }));
}

/**
 * Parses LRC formatted string into structured timestamped lines
 */
export function parseLrc(lrcString: string): LyricLine[] {
  if (!lrcString || typeof lrcString !== "string") return [];

  const lines = lrcString.split("\n");
  const parsed: LyricLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    timeRegex.lastIndex = 0;
    const matches = Array.from(trimmed.matchAll(timeRegex));
    if (matches.length === 0) continue;

    const textOnly = trimmed.replace(timeRegex, "").trim();
    if (!textOnly) continue;

    for (const match of matches) {
      const minutes = parseInt(match[1], 10) || 0;
      const seconds = parseInt(match[2], 10) || 0;
      const fractionStr = match[3] || "0";
      const fraction = fractionStr.length === 3 ? parseInt(fractionStr, 10) / 1000 : parseInt(fractionStr, 10) / 100;
      const totalSeconds = Math.max(0, minutes * 60 + seconds + fraction);

      parsed.push({
        time: Math.round(totalSeconds * 100) / 100,
        text: transliterateDevanagari(textOnly),
      });
    }
  }

  parsed.sort((a, b) => a.time - b.time);
  return parsed;
}

function cleanSongTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/[\(\[\{].*?(?:official|audio|video|lyrics|hd|4k|remastered|version|feat|ft).*?[\)\]\}]/gi, "")
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\s*ft\.?.*$/i, "")
    .replace(/\s*feat\.?.*$/i, "")
    .replace(/\|\s*.*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Step A: Fetch synced lyrics from LRCLIB
 */
async function fetchFromLrclib(
  title: string,
  artist: string,
  duration?: number,
): Promise<LyricsResult | null> {
  const cleanTitle = cleanSongTitle(title);
  const cleanArtist = cleanArtistName(artist);

  if (!cleanTitle) return null;

  // 1. Direct match endpoint
  try {
    const params = new URLSearchParams({
      track_name: cleanTitle,
      artist_name: cleanArtist !== "Unknown Artist" ? cleanArtist : "",
    });
    if (duration && duration > 0) {
      params.set("duration", Math.round(duration).toString());
    }

    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: {
        "User-Agent": "MevoMusic/1.0 (https://github.com/mahimunem05/Mevo-Youtube)",
      },
      signal: AbortSignal.timeout(3500),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.syncedLyrics) {
        const lines = parseLrc(data.syncedLyrics);
        if (lines.length > 0) {
          return { source: "lrclib", lines: processLyricsLines(lines) };
        }
      }
    }
  } catch {
    /* fallback to search */
  }

  // 2. Search fallback endpoint
  try {
    const query = `${cleanTitle} ${cleanArtist !== "Unknown Artist" ? cleanArtist : ""}`.trim();
    const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
      headers: {
        "User-Agent": "MevoMusic/1.0 (https://github.com/mahimunem05/Mevo-Youtube)",
      },
      signal: AbortSignal.timeout(3500),
    });

    if (res.ok) {
      const results = await res.json();
      if (Array.isArray(results) && results.length > 0) {
        const withSynced = results.find((r) => r.syncedLyrics);
        if (withSynced && withSynced.syncedLyrics) {
          const lines = parseLrc(withSynced.syncedLyrics);
          if (lines.length > 0) {
            return { source: "lrclib", lines: processLyricsLines(lines) };
          }
        }
      }
    }
  } catch {
    /* fallback to YouTube */
  }

  return null;
}

/**
 * Step B: Fetch closed captions / auto-subtitles from Backend YouTube Extractor
 */
async function fetchFromYouTubeCaptions(videoId: string): Promise<LyricsResult | null> {
  const cleanId = videoId.replace(/^yt-/, "").trim();
  if (!cleanId) return null;

  try {
    const backendUrl = getExtractorBaseUrl();
    const res = await fetch(`${backendUrl}/api/lyrics/youtube?videoId=${encodeURIComponent(cleanId)}`, {
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.lyrics) && data.lyrics.length > 0) {
        return {
          source: "youtube_captions",
          language: data.language,
          lines: processLyricsLines(data.lyrics),
        };
      }
    }
  } catch (err) {
    console.warn("[Lyrics] YouTube captions fetch failed:", err);
  }

  return null;
}

/**
 * Master Dual-Source Lyrics Fetching Pipeline
 * 1. Queries LRCLIB for studio-grade LRC lyrics
 * 2. If missing, queries Backend YouTube Closed Captions & Auto-Subtitles
 * 3. Applies Devanagari-exclusive transliteration (Romanization for Hindi, 100% native for Bengali and English)
 */
export async function fetchSongLyrics(song: {
  id: string;
  title: string;
  artist: string;
  duration?: number;
}): Promise<LyricsResult | null> {
  if (!song || !song.id) return null;

  const cacheKey = song.id;
  if (lyricsMemoryCache.has(cacheKey)) {
    return lyricsMemoryCache.get(cacheKey) || null;
  }

  try {
    // Step A: LRCLIB
    const lrclibResult = await fetchFromLrclib(song.title, song.artist, song.duration);
    if (lrclibResult && lrclibResult.lines.length > 0) {
      lyricsMemoryCache.set(cacheKey, lrclibResult);
      return lrclibResult;
    }

    // Step B: YouTube Closed Captions & Subtitles Extractor
    const ytResult = await fetchFromYouTubeCaptions(song.id);
    if (ytResult && ytResult.lines.length > 0) {
      lyricsMemoryCache.set(cacheKey, ytResult);
      return ytResult;
    }
  } catch (err) {
    console.warn("[Lyrics] Error in dual-source lyrics pipeline:", err);
  }

  lyricsMemoryCache.set(cacheKey, null);
  return null;
}
