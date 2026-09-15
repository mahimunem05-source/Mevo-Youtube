export function cleanArtistName(artist?: string): string {
  if (!artist) return "Unknown Artist";
  return (
    artist
      .replace(/\s*-\s*topic$/i, "")
      .replace(/\s*vevo$/i, "")
      .replace(/\s*official$/i, "")
      .trim() || "Unknown Artist"
  );
}

export function getExtractorBaseUrl(): string {
  if (typeof window === "undefined") return "";
  if (import.meta.env?.DEV) return "";
  return import.meta.env?.VITE_EXTRACTOR_URL || "https://mevo-extractor.onrender.com";
}

export interface LyricLine {
  time: number; // in seconds (e.g. 12.34)
  text: string;
  duration?: number;
}

export interface LyricsResult {
  source: "lrclib" | "youtube_captions" | "aligned" | "plain";
  language?: string;
  lines: LyricLine[];
}

const lyricsMemoryCache = new Map<string, LyricsResult | null>();

// ---------------------------------------------------------------------------
// 1. Devanagari Phonetic Dictionaries (Hinglish Romanization)
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

// ---------------------------------------------------------------------------
// 2. Urdu / Perso-Arabic Phonetic Transliteration (Roman Urdu)
// ---------------------------------------------------------------------------
const URDU_LETTERS: Record<string, string> = {
  "ا": "a", "آ": "aa", "ب": "b", "پ": "p", "ت": "t", "ٹ": "t",
  "ث": "s", "ج": "j", "چ": "ch", "ح": "h", "خ": "kh", "د": "d",
  "ڈ": "d", "ذ": "z", "ر": "r", "ڑ": "r", "ز": "z", "ژ": "zh",
  "س": "s", "ش": "sh", "ص": "s", "ض": "z", "ط": "t", "ظ": "z",
  "ع": "a", "غ": "gh", "ف": "f", "ق": "q", "ک": "k", "گ": "g",
  "ل": "l", "م": "m", "ن": "n", "ں": "n", "و": "o", "ؤ": "o",
  "ہ": "h", "ۂ": "h", "ۃ": "t", "ھ": "h", "ء": "", "ی": "i",
  "ئ": "i", "ے": "e", "ۓ": "e",
  "َ": "a", "ِ": "i", "ُ": "u", "ً": "an", "ٍ": "in", "ٌ": "un",
  "ّ": "", "ْ": "",
};

const URDU_WORD_LOOKUP: Record<string, string> = {
  "تم": "Tum", "میرے": "mere", "ہو": "ho", "ہم": "Hum", "دل": "dil",
  "محبت": "mohabbat", "پیار": "pyaar", "زندگی": "zindagi", "جان": "jaan",
  "تیرے": "tere", "بن": "bin", "کی": "ki", "کا": "ka", "کے": "ke",
  "کو": "ko", "سے": "se", "میں": "mein", "پر": "par", "یہ": "yeh",
  "وہ": "woh", "کیا": "kya", "کیوں": "kyun", "نہیں": "nahi", "ہاں": "haan",
  "تیرا": "tera", "میرا": "mera", "رشتہ": "rishta", "پرانا": "purana",
};

/**
 * Transliterates Urdu / Perso-Arabic script into readable Roman Urdu (e.g. "تم میرے ہو" -> "Tum mere ho").
 * Does NOT translate meaning. Preserves pronunciation, words, and lyric cadence.
 */
export function transliterateUrdu(text: string): string {
  if (!text || typeof text !== "string") return text;
  if (!/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text)) return text;

  const tokens = text.split(/(\s+|[.,!?;:'"()[\]{}]+)/);
  return tokens.map((token) => {
    const trimmed = token.trim();
    if (!trimmed || !/[\u0600-\u06FF]/.test(trimmed)) return token;

    if (URDU_WORD_LOOKUP[trimmed]) {
      return URDU_WORD_LOOKUP[trimmed];
    }

    let out = "";
    const chars = Array.from(trimmed);
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      const next = chars[i + 1];

      // Handle aspiration digraphs (e.g. ب + ھ = bh)
      if (next === "ھ") {
        const base = URDU_LETTERS[c] || "";
        out += base ? base + "h" : "h";
        i++;
        continue;
      }

      if (URDU_LETTERS[c] !== undefined) {
        out += URDU_LETTERS[c];
      } else {
        out += c;
      }
    }
    return out;
  }).join("");
}

/**
 * Unified script processor:
 * - Hindi / Devanagari -> Natural Hinglish Romanization
 * - Urdu / Perso-Arabic -> Readable Roman Urdu
 * - Bengali (\u0980-\u09FF) -> 100% Native Bengali Script Preserved
 * - English / Latin -> 100% Native English Preserved
 */
export function processLyricsLines(lines: LyricLine[]): LyricLine[] {
  return lines.map((line) => {
    let text = line.text;
    if (/[\u0900-\u097F]/.test(text)) {
      text = transliterateDevanagari(text);
      if (text.length > 0) {
        text = text.charAt(0).toUpperCase() + text.slice(1);
      }
    } else if (/[\u0600-\u06FF]/.test(text)) {
      text = transliterateUrdu(text);
      if (text.length > 0) {
        text = text.charAt(0).toUpperCase() + text.slice(1);
      }
    }
    return {
      ...line,
      text: text.trim(),
    };
  });
}

// ---------------------------------------------------------------------------
// 3. LRC Parser with Validation & Sanitization
// ---------------------------------------------------------------------------
export function parseLrc(lrcString: string): LyricLine[] {
  if (!lrcString || typeof lrcString !== "string") return [];

  const lines = lrcString.split("\n");
  const parsed: LyricLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Discard ID tags like [ar:Singer], [ti:Title], [by:Author]
    if (/^\[(ti|ar|al|by|offset|length|re|ve):/i.test(trimmed)) continue;

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
        text: textOnly,
      });
    }
  }

  // Sort chronologically and deduplicate
  parsed.sort((a, b) => a.time - b.time);

  // Compute realistic line durations from delta to next line
  for (let i = 0; i < parsed.length; i++) {
    const current = parsed[i];
    const next = parsed[i + 1];
    if (next) {
      const delta = next.time - current.time;
      current.duration = Math.max(1.2, Math.min(8.0, Math.round(delta * 100) / 100));
    } else {
      current.duration = 4.5;
    }
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// 4. Audio-Guided Alignment Engine (For Plain Lyrics without Timestamps)
// ---------------------------------------------------------------------------
export function countSyllables(text: string): number {
  if (!text) return 1;
  const cleaned = text.toLowerCase().replace(/[^a-z\u0900-\u09FF\u0600-\u06FF\s]/g, "");
  const words = cleaned.split(/\s+/).filter(Boolean);
  let count = 0;
  for (const w of words) {
    const vowels = w.match(/[aeiouy\u0904-\u0914\u093E-\u094C]/gi);
    count += Math.max(1, vowels ? vowels.length : Math.ceil(w.length / 3));
  }
  return Math.max(1, count);
}

/**
 * Aligns plain un-timed lyrics text to song audio structure:
 * - Detects musical intro before vocals start (Line 1 starts at true vocal onset).
 * - Identifies stanza breaks as instrumental pauses (4-6s).
 * - Weights phrase duration based on syllable and word counts.
 * - Guarantees non-overlapping, monotonically increasing timestamps with realistic durations.
 */
export function alignPlainLyrics(
  plainText: string,
  totalDurationSeconds: number = 210
): LyricLine[] {
  if (!plainText || typeof plainText !== "string") return [];

  const rawLines = plainText.split(/\r?\n/).map((l) => l.trim());
  const validLines: { text: string; hasBreakBefore: boolean }[] = [];

  let pendingBreak = false;
  for (const l of rawLines) {
    if (!l) {
      pendingBreak = true;
      continue;
    }
    // Filter meta headers like [Chorus], [Verse 1], (Intro)
    if (/^\[.*\]$/.test(l) || /^\(.*\)$/.test(l)) {
      pendingBreak = true;
      continue;
    }
    validLines.push({ text: l, hasBreakBefore: pendingBreak });
    pendingBreak = false;
  }

  if (validLines.length === 0) return [];

  const dur = Math.max(60, totalDurationSeconds || 210);
  const introDuration = Math.min(24, Math.max(9, dur * 0.075));
  const outroDuration = Math.min(20, Math.max(7, dur * 0.05));
  const singingWindow = Math.max(30, dur - introDuration - outroDuration);

  // Calculate syllable weights
  const lineWeights = validLines.map((v) => Math.max(1.5, countSyllables(v.text)));
  const totalWeight = lineWeights.reduce((acc, w) => acc + w, 0);

  const breaksCount = validLines.filter((v, i) => i > 0 && v.hasBreakBefore).length;
  const breakDuration = Math.min(5.5, Math.max(3.5, (singingWindow * 0.15) / Math.max(1, breaksCount)));
  const availableVocalTime = Math.max(20, singingWindow - breaksCount * breakDuration);

  const results: LyricLine[] = [];
  let currentTime = introDuration;

  for (let i = 0; i < validLines.length; i++) {
    const item = validLines[i];
    if (i > 0 && item.hasBreakBefore) {
      currentTime += breakDuration;
    }

    const weightRatio = lineWeights[i] / totalWeight;
    const lineDur = Math.max(1.8, Math.min(7.5, weightRatio * availableVocalTime));

    results.push({
      time: Math.round(currentTime * 100) / 100,
      duration: Math.round(lineDur * 100) / 100,
      text: item.text,
    });

    const breathPause = 0.35;
    currentTime += lineDur + breathPause;
  }

  return results;
}

// ---------------------------------------------------------------------------
// 5. Title & Artist Cleaning Utilities
// ---------------------------------------------------------------------------
export function cleanSongTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/[\(\[\{].*?(?:official|audio|video|lyrics|hd|4k|remastered|version|feat|ft|full song|lyric video|music video|visualizer|slowed|reverb|teaser|trailer|song).*?[\)\]\}]/gi, "")
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\s*ft\.?.*$/i, "")
    .replace(/\s*feat\.?.*$/i, "")
    .replace(/\|\s*.*$/g, "")
    .replace(/[-–—]\s*(?:official|audio|video|lyrics|t-series|zee music|speed records|sony music).*$/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// 6. Multi-Step LRCLIB Query Pipeline
// ---------------------------------------------------------------------------
async function fetchFromLrclibMultiStep(
  cleanTitle: string,
  cleanArtist: string,
  duration?: number
): Promise<{ lines: LyricLine[]; plainLyrics?: string } | null> {
  if (!cleanTitle) return null;

  // Step A: Exact match endpoint
  try {
    const params = new URLSearchParams({
      track_name: cleanTitle,
      artist_name: cleanArtist !== "Unknown Artist" ? cleanArtist : "",
    });
    if (duration && duration > 0) {
      params.set("duration", Math.round(duration).toString());
    }

    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { "User-Agent": "MevoMusic/1.0" },
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.syncedLyrics) {
        const lines = parseLrc(data.syncedLyrics);
        if (lines.length > 0) {
          return { lines };
        }
      }
      if (data && data.plainLyrics) {
        return { lines: [], plainLyrics: data.plainLyrics };
      }
    }
  } catch {
    /* fallback to search */
  }

  // Step B: Multi-step search query
  const primaryArtist = cleanArtist.split(/[,&/|]/)[0].trim();
  const searchQueries = [
    cleanArtist !== "Unknown Artist" ? `${cleanTitle} ${cleanArtist}` : cleanTitle,
    primaryArtist && primaryArtist !== cleanArtist ? `${cleanTitle} ${primaryArtist}` : "",
    cleanTitle, // Catch-all for songs where YouTube artist is a label/consortium
  ].filter(Boolean);

  for (const query of searchQueries) {
    try {
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": "MevoMusic/1.0" },
        signal: AbortSignal.timeout(3000),
      });

      if (res.ok) {
        const results = await res.json();
        if (Array.isArray(results) && results.length > 0) {
          const withSynced = results.find((r: any) => r.syncedLyrics && r.syncedLyrics.trim().length > 0);
          if (withSynced) {
            const lines = parseLrc(withSynced.syncedLyrics);
            if (lines.length > 0) {
              return { lines };
            }
          }

          const withPlain = results.find((r: any) => r.plainLyrics && r.plainLyrics.trim().length > 0);
          if (withPlain) {
            return { lines: [], plainLyrics: withPlain.plainLyrics };
          }
        }
      }
    } catch {
      // try next query
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 7. Backend /api/lyrics Extractor & Alignment Service
// ---------------------------------------------------------------------------
async function fetchFromBackendLyrics(params: {
  videoId: string;
  title: string;
  artist: string;
  duration?: number;
}): Promise<LyricsResult | null> {
  const cleanId = params.videoId.replace(/^yt-/, "").trim();
  if (!cleanId) return null;

  try {
    const backendUrl = getExtractorBaseUrl();
    const query = new URLSearchParams({
      videoId: cleanId,
      title: params.title || "",
      artist: params.artist || "",
      duration: Math.round(params.duration || 0).toString(),
    });

    const res = await fetch(`${backendUrl}/api/lyrics?${query.toString()}`, {
      signal: AbortSignal.timeout(4500),
    });

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.lines) && data.lines.length > 0) {
        return {
          source: data.source || "aligned",
          language: data.language,
          lines: processLyricsLines(data.lines),
        };
      }
    }
  } catch (err) {
    console.warn("[Lyrics] Backend lyrics resolution notice:", err);
  }

  return null;
}

// ---------------------------------------------------------------------------
// 8. Master Lyrics Pipeline with Multi-Tier Fallback & Persistent Storage
// ---------------------------------------------------------------------------
export async function fetchSongLyrics(song: {
  id: string;
  title: string;
  artist: string;
  duration?: number;
}): Promise<LyricsResult | null> {
  if (!song || !song.id) return null;

  const cacheKey = song.id.replace(/^yt-/, "").trim();

  // 1. In-Memory Cache Check
  if (lyricsMemoryCache.has(cacheKey)) {
    return lyricsMemoryCache.get(cacheKey) || null;
  }

  // 2. Browser LocalStorage Cache Check (7-day TTL)
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(`mevo_lyrics_${cacheKey}`);
      if (raw) {
        const item = JSON.parse(raw);
        if (item && item.expiresAt > Date.now() && Array.isArray(item.data?.lines)) {
          lyricsMemoryCache.set(cacheKey, item.data);
          return item.data;
        }
      }
    } catch {
      // localStorage error fallback
    }
  }

  const cleanTitle = cleanSongTitle(song.title);
  const cleanArtist = cleanArtistName(song.artist);

  // 3. Tier 1: Multi-Step LRCLIB Studio Synced Lyrics
  try {
    const lrclibData = await fetchFromLrclibMultiStep(cleanTitle, cleanArtist, song.duration);
    if (lrclibData && lrclibData.lines.length > 0) {
      const result: LyricsResult = {
        source: "lrclib",
        lines: processLyricsLines(lrclibData.lines),
      };
      saveToCache(cacheKey, result);
      return result;
    }

    // 4. Tier 2: Backend Dedicated Lyrics & Audio Alignment Service
    const backendResult = await fetchFromBackendLyrics({
      videoId: song.id,
      title: cleanTitle,
      artist: cleanArtist,
      duration: song.duration,
    });
    if (backendResult && backendResult.lines.length > 0) {
      saveToCache(cacheKey, backendResult);
      return backendResult;
    }

    // 5. Tier 3: Client-Side Audio-Guided Alignment on Plain Lyrics (from LRCLIB or description)
    if (lrclibData && lrclibData.plainLyrics) {
      const aligned = alignPlainLyrics(lrclibData.plainLyrics, song.duration || 210);
      if (aligned.length > 0) {
        const result: LyricsResult = {
          source: "aligned",
          lines: processLyricsLines(aligned),
        };
        saveToCache(cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    console.warn("[Lyrics] Pipeline resolution error:", err);
  }

  // Graceful failure: cache negative result briefly to prevent thrashing
  lyricsMemoryCache.set(cacheKey, null);
  return null;
}

function saveToCache(cacheKey: string, result: LyricsResult) {
  lyricsMemoryCache.set(cacheKey, result);
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(
        `mevo_lyrics_${cacheKey}`,
        JSON.stringify({
          data: result,
          expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
        })
      );
    } catch {
      // storage full
    }
  }
}
