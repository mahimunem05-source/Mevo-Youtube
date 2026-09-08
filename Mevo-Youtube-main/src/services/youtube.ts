/**
 * YouTube Data API v3 Service & Category Engine
 * Powers the YouTube-First streaming catalogue on MEVO with Extractor fallback.
 */

import type { SectionId, Song } from "@/data/songs";
import { getYouTubeStreamUrl, getExtractorBaseUrl } from "@/lib/extractor";

export interface YouTubeSearchResult {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
  description?: string;
  publishedAt?: string;
  duration?: number;
  viewCount?: number;
}

export interface YouTubeVideoDetail {
  id: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  description: string;
  publishedAt: string;
  duration: number; // in seconds
  viewCount: number;
}

// In-memory cache for API responses (TTL: 20 minutes across dev and prod)
const CACHE_TTL_MS = 20 * 60 * 1000;
const memoryCache = new Map<string, { timestamp: number; data: any }>();
const inFlightPromises = new Map<string, Promise<any>>();

export function getCachedYouTubeData<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data as T;
  }
  return null;
}

export function setCachedYouTubeData<T>(key: string, data: T): void {
  memoryCache.set(key, { timestamp: Date.now(), data });
}

export function fetchWithSingleFlight<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const cached = getCachedYouTubeData<T>(key);
  if (cached !== null) {
    return Promise.resolve(cached);
  }

  const existingFlight = inFlightPromises.get(key);
  if (existingFlight) {
    return existingFlight as Promise<T>;
  }

  const promise = fetcher()
    .then((result) => {
      setCachedYouTubeData(key, result);
      inFlightPromises.delete(key);
      return result;
    })
    .catch((err) => {
      inFlightPromises.delete(key);
      throw err;
    });

  inFlightPromises.set(key, promise);
  return promise;
}

/**
 * Decodes common HTML entities returned in YouTube API strings
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&apos;/g, "'");
}

/**
 * Parses ISO 8601 duration format (e.g. PT3M45S, PT1H2M30S, PT45S) into total seconds.
 */
export function parseYouTubeDuration(durationStr?: string): number {
  if (!durationStr) return 0;
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  return hours * 3600 + minutes * 60 + seconds;
}

// ---------------------------------------------------------------------------
// Client-side Key Stubs (YouTube API Keys are securely restricted to backend)
// ---------------------------------------------------------------------------
export function getYouTubeApiKey(): string {
  return "";
}

export function markYouTubeApiKeyExhausted(_key: string): void {}

/**
 * Strict Non-Music, YouTube Shorts, & Compilation / Chart Recap Filter
 */
const NEGATIVE_KEYWORDS = [
  // Natok, drama, series & TV shows
  "natok",
  "bangla natok",
  "telefilm",
  "drama",
  "full episode",
  "episode ",
  "ep ",
  "serial",
  "bangla serial",
  "hindi serial",
  "star jalsha",
  "zee bangla",
  "colors bangla",
  "sun bangla",
  "sony aath",
  "sony pal",
  "sab tv",
  "set india",
  "cid",
  "crime patrol",
  "savdhaan india",
  "aahat",
  "fear files",
  "tarak mehta",
  "taarak mehta",
  "tmkoc",
  "kapil sharma",
  "the kapil sharma show",
  "rannaghor",
  "didi no 1",
  "dadagiri",
  "mirakkel",
  "reality show",
  "talk show",
  "web series",
  "bhojpuri film",
  "vlog",
  "review",
  "reaction",
  "reacts",
  "first time hearing",
  "status video",
  "whatsapp status",
  "status",
  "slowed",
  "reverb",
  "slowed+reverb",
  "slowed reverb",
  "fan edit",
  "1 hour loop",
  "10 hours loop",
  "1 hour",
  "10 hr",
  "hour loop",
  "hours loop",
  "bass boosted",
  "8d audio",
  "sped up",
  "nightcore",
  "ringtone",
  "parody",
  "bgm ringtone",
  "tutorial",
  "gameplay",
  "gaming",
  "walkthrough",
  "trailer",
  "teaser",
  "short film",
  "funny video",
  "comedy scene",
  "comedy video",
  "prank",
  "roast",
  "unboxing",
  "news",
  "breaking news",
  "bulletin",
  "podcast",
  "interview",
  "behind the scenes",
  "making of",
  "press conference",
  "waz",
  "mahfil",
  "full movie",
  "movie scene",
  "movie clip",
  "highlights",

  // Cartoons, Kids, Animations & Fan Edits (STRICT ZERO-TOLERANCE)
  "gopal bhar",
  "gopalbhaar",
  "gopal var",
  "gopalbhar",
  "motu patlu",
  "chhota bheem",
  "chota bheem",
  "cartoon",
  "cartoons",
  "animated",
  "animation",
  "nursery rhymes",
  "nursery rhyme",
  "kids",
  "kid song",
  "kids song",
  "kids songs",
  "children song",
  "children songs",
  "anime amv",
  "amv",
  "gacha",
  "gacha life",
  "meme animation",
  "stickman",
  "cocomelon",
  "baby",
  "baby song",
  "cartoon video",
  "peppa pig",
  "chuchu tv",
  "chuchutv",
  "rhymes",
  "rhyme",
  "lullaby",
  "bedtime story",
  "toddler",
  "disney junior",
  "nick jr",
  "pinkfong",
  "doraemon",
  "shinchan",
  "oggy",
  "oggy and the cockroaches",
  "tom and jerry",
  "little krishna",
  "ben 10",
  "superhero animation",
  "2d animation",
  "3d animation",
  "fan animated",
  "flipaclip",
  "claymation",
  "talking tom",
  "baby bus",
  "infobells",
  "geethanjali kids",
  "masha and the bear",
  "ryan's world",
  "vlad and niki",
  "diana and roma",
  "ai cover",
  "ai song",
  "ai music",
  "fan-made",
  "fan made",
  "mashup preview",
  "instrumental remake",
  "karaoke version",
  "vocal cut",
  "unofficial",
  "amateur cover",
  "cover by fan",
];

const COMPILATION_AND_RECAP_PATTERNS = [
  /\btop\s*\d{1,3}\b/i,          // "top 10", "top 20", "top 25", "top 50", "top 100", "top10"
  /\bhot\s*\d{1,3}\b/i,          // "hot 100", "hot 50"
  /\bbillboard\b/i,              // "billboard", "billboard hot"
  /\btop\s*songs?\b/i,           // "top songs", "top song"
  /\bbest\s*songs?\s*(?:of)?\b/i,// "best songs of", "best songs"
  /\bhits?\s*202\d\b/i,          // "hits 2024", "hits 2025", "hits 2026"
  /\bmashup\s*preview\b/i,       // "mashup preview"
  /\brecaps?\b/i,                // "recap", "recaps"
  /\bcountdowns?\b/i,            // "countdown", "countdowns"
  /\bthis\s*week\b/i,            // "this week"
  /\bmegamix\b/i,                // "megamix"
  /\bcompilations?\b/i,          // "compilation", "compilations"
  /\bgreatest\s*hits?\s*(?:collection|album)?\b/i,
  /\brankings?\b/i,              // "rank", "ranking", "rankings"
  /\bchart\s*(?:data|recap|preview|show|hits|top|rank)\b/i,
  /\bjukebox\b/i,
  /\bnon\s*stop\b/i,
  /\bnonstop\b/i,
  /\ball\s*songs\b/i,
  /\bfull\s*album\b/i,
  /\baudio\s*jukebox\b/i,
];

const BANNED_CHANNELS = [
  // News & Broadcasters
  "jamuna tv",
  "somoy tv",
  "ekattor",
  "channel 24",
  "independent television",
  "dbc news",
  "ntv news",
  "atn news",
  "news24",
  "bbc news",
  "cnn",
  "ndtv",
  "aaj tak",
  "zee news",
  "abp news",
  "india today",
  "al jazeera",
  "reuters",
  "wion",
  "dd news",
  "times now",
  "republic bharat",
  "inmusic",
  "top music hits",
  "billboard",
  "billboard chart",
  "billboard charts",
  "redlist",
  "chart data",
  "music chart",
  "top hits",
  "top songs",
  "ranking music",
  "music ranking",
  "song recap",
  "top music",
  "best music chart",
  "world music awards",
  "hit parade",
  "charts",
  "television",
  "news",
  "mahfil",
  "waz",
  // Kids & Cartoon Channels
  "sony aath",
  "sonyaath",
  "cocomelon",
  "chuchu tv",
  "chuchutv",
  "pinkfong",
  "peppa pig",
  "super simple songs",
  "little angel",
  "kids tv",
  "lallu tv",
  "toons",
  "cartoon network",
  "nickelodeon",
  "disney junior",
  "disney channel",
  "pogo",
  "sonic gang",
  "hungama",
  "sony yay",
  "doraemon",
  "shinchan",
  "oggy and the cockroaches",
  "baby bus",
  "bounce patrol",
  "infobells",
  "geethanjali kids",
  "chu chu tv",
  "cvs 3d rhymes",
  "masha and the bear",
  "talking tom",
  "ryan's world",
  "vlad and niki",
  "diana and roma",
  // TV & Entertainment Channels
  "star jalsha",
  "zee bangla",
  "colors bangla",
  "sony pal",
  "sab tv",
  "set india",
  "shemaroo",
  "goldmines",
  "goldmines telefilms",
  "shemaroo movies",
];

const SHORTS_PATTERNS = [
  /#shorts\b/i,
  /#short\b/i,
  /\bshorts\b/i,
  /\bshort video\b/i,
  /\btiktok\b/i,
  /\/shorts\//i,
  /\(shorts\)/i,
  /\[shorts\]/i,
];

export const VERIFIED_RECORD_LABELS = [
  "t-series",
  "sony music",
  "svf",
  "saregama",
  "zee music",
  "universal music",
  "warner music",
  "tips official",
  "g-series",
  "anupam",
  "eagle music",
  "speed records",
  "yrf",
  "eros now",
  "times music",
  "aditya music",
  "lahari music",
  "virgin music",
  "rca records",
  "columbia records",
  "atlantic records",
  "def jam",
  "republic records",
  "interscope",
  "big hit",
  "hybe",
  "smtown",
  "jyp",
  "yg entertainment",
  "vevo",
];

/**
 * Calculates priority score for official releases (0 to 100)
 */
export function getOfficialContentScore(channel: string, title: string): number {
  const c = channel.toLowerCase();
  const t = title.toLowerCase();

  // 1. YouTube Topic Channel (High fidelity auto-generated official audio)
  if (c.endsWith("- topic") || c.includes("- topic")) return 100;

  // 2. Verified Major Record Labels
  for (const label of VERIFIED_RECORD_LABELS) {
    if (c.includes(label)) return 90;
  }

  // 3. VEVO / Official Artist Channel
  if (c.includes("vevo") || c.includes("official")) return 80;

  // 4. Official Audio / Official Video in Title
  if (t.includes("official audio") || t.includes("official music video")) return 70;
  if (t.includes("official video") || t.includes("audio track")) return 60;

  return 20;
}

/**
 * Strict Music-Only Content Validator.
 * Rejects non-music videos, cartoons, TV episodes, movie scenes, podcasts, news, shorts, and long compilations.
 */
export function isMusicContent(
  title: string,
  channel: string,
  description = "",
  durationSeconds = 0,
  isMadeForKids = false,
  categoryId?: string
): boolean {
  // 0. Explicit Made For Kids / Non-Music Category rejection
  if (isMadeForKids) {
    return false;
  }
  if (categoryId && categoryId !== "10") {
    return false;
  }

  const titleLower = title.toLowerCase();
  const channelLower = channel.toLowerCase();
  const text = `${titleLower} ${channelLower} ${description.toLowerCase()}`;

  // 1. Strict Duration Filter: Minimum 60 seconds (1 min) and Maximum 480 seconds (8 min)
  if (durationSeconds > 0 && (durationSeconds < 60 || durationSeconds > 480)) {
    return false;
  }

  // 2. Shorts patterns
  for (const pattern of SHORTS_PATTERNS) {
    if (pattern.test(title) || pattern.test(description)) {
      return false;
    }
  }

  // 3. Compilation, Countdown & Chart Recap Patterns (Checked on title and channel)
  for (const pattern of COMPILATION_AND_RECAP_PATTERNS) {
    if (pattern.test(title) || pattern.test(channel)) {
      return false;
    }
  }

  // 4. Banned news, broadcaster, kids, cartoon, and compilation channels
  for (const bannedChannel of BANNED_CHANNELS) {
    if (channelLower.includes(bannedChannel)) {
      return false;
    }
  }

  // 5. Check for negative keywords (cartoons, kids, drama, news, fan edits, TV series)
  for (const keyword of NEGATIVE_KEYWORDS) {
    if (text.includes(keyword)) {
      return false;
    }
  }

  return true;
}

/**
 * Cleans YouTube video titles and parses artist / title components
 */
export function cleanYouTubeTitle(rawTitle: string, channelName: string): { title: string; artist: string } {
  let decoded = decodeHtmlEntities(rawTitle).trim();

  // Strip hashtags
  decoded = decoded.replace(/#\w+/g, "");

  // Strip bracket / parenthetical noise e.g. [Official Music Video], (Official Audio), (4K 60FPS), [AMV]
  decoded = decoded
    .replace(/\[\s*(?:Official\s*(?:Music\s*)?Video|Official\s*Audio|Official\s*HD\s*Video|Full\s*Video|Music\s*Video|Lyric\s*Video|Audio|4K|HD|Full\s*Song|Visualizer|Shorts|Lyrics|Lofi|HQ|Full\s*HD|Remastered|Slowed\s*(?:and|&|\+)?\s*Reverb|8D\s*Audio|New\s*Song|Remix\s*Full\s*Song|AMV|Animation|Fan\s*Made)\s*\]/gi, " ")
    .replace(/\(\s*(?:Official\s*(?:Music\s*)?Video|Official\s*Audio|Official\s*HD\s*Video|Full\s*Video|Music\s*Video|Lyric\s*Video|Audio|4K|HD|Full\s*Song|Visualizer|Shorts|Lyrics|Lofi|HQ|Full\s*HD|Remastered|Slowed\s*(?:and|&|\+)?\s*Reverb|4K\s*60FPS|8D\s*Audio|New\s*Song|Remix\s*Full\s*Song|AMV|Animation|Fan\s*Made|From\s*[^)]+)\s*\)/gi, " ")
    .replace(/^(?:Lyrical|Audio|Video|Official\s*Video|Official\s*Audio)\s*:\s*/gi, "")
    .replace(/\s*\|\s*(?:Official\s*Video|Official\s*Audio|Full\s*Song|Lyrical\s*Video|Full\s*Audio|T-Series|Sony\s*Music\s*India|SVF|Zee\s*Music\s*Company|Saregama\s*Music|G-Series|Anupam\s*Recording\s*Media|Eagle\s*Music|Tips\s*Official|Speed\s*Records|Speed\s*Audio).*$/gi, " ")
    .replace(/\b(?:4K|8K|1080p|720p|60FPS|Full\s*HD|HD|HQ|Visualizer)\b/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Strip quotes wrapping around artist or title e.g. Artist - "Title" or "Artist" - "Title"
  // Check if title has "Artist - Song Title" structure
  const dashSeparators = [" - ", " – ", " — ", " : "];
  for (const sep of dashSeparators) {
    if (decoded.includes(sep)) {
      const parts = decoded.split(sep);
      if (parts.length >= 2) {
        const potentialArtist = parts[0].replace(/^["'“”]+|["'“”]+$/g, "").trim();
        const potentialTitle = parts.slice(1).join(" - ").replace(/^["'“”]+|["'“”]+$/g, "").trim();
        if (potentialArtist.length > 0 && potentialTitle.length > 0) {
          return {
            title: potentialTitle,
            artist: potentialArtist,
          };
        }
      }
    }
  }

  // Check if title has Artist "Title" structure (e.g. INTERWORLD "METAMORPHOSIS" or INTERWORLD 'METAMORPHOSIS')
  const quotedMatch = decoded.match(/^([^\s"“”'][^"“”']{1,40})\s+["“'‘]([^"”'’]+)["”'’]$/);
  if (quotedMatch) {
    const potentialArtist = quotedMatch[1].trim();
    const potentialTitle = quotedMatch[2].trim();
    if (potentialArtist.length > 0 && potentialTitle.length > 0) {
      return {
        title: potentialTitle,
        artist: potentialArtist,
      };
    }
  }

  const cleanChannel = decodeHtmlEntities(channelName)
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/\s*VEVO$/i, "")
    .replace(/\s*Official$/i, "")
    .trim();

  const cleanedTitle = decoded.replace(/^["'“”]+|["'“”]+$/g, "").trim();

  return {
    title: cleanedTitle || rawTitle,
    artist: cleanChannel || "Unknown Artist",
  };
}

/**
 * Normalizes title or artist text by stripping noise tags, brackets, special characters,
 * and extracting clean lowercase alphanumeric tokens.
 */
export function normalizeCoreTitle(text: string): string {
  if (!text) return "";
  let s = decodeHtmlEntities(text).toLowerCase();

  // 1. Remove URLs and hashtags
  s = s.replace(/https?:\/\/\S+/gi, "").replace(/#\w+/gi, "");

  // 2. Strip bracket and parenthetical noise tags:
  // e.g. (Official Audio), [Official Music Video], (Lyrics), (Audio), (4K 60FPS), (Slowed + Reverb), (Remastered 2023), [AMV], [Visualizer]
  const noiseTagPatterns = [
    /\[\s*[^\]]*(?:official|audio|video|lyric|visualizer|remaster|slowed|reverb|sped\s*up|speed\s*up|nightcore|4k|8k|hd|hq|1080p|720p|60fps|prod\.|feat\.|ft\.|amv|lofi|edit|full\s*song|clean|explicit|version|remix|from\s+[^\]]*)[^\]]*\]/gi,
    /\(\s*[^)]*(?:official|audio|video|lyric|visualizer|remaster|slowed|reverb|sped\s*up|speed\s*up|nightcore|4k|8k|hd|hq|1080p|720p|60fps|prod\.|feat\.|ft\.|amv|lofi|edit|full\s*song|clean|explicit|version|remix|from\s+[^)]*)[^)]*\)/gi,
  ];
  for (const pattern of noiseTagPatterns) {
    s = s.replace(pattern, " ");
  }

  // 3. Remove separator noise after pipes | or hyphens with labels
  s = s.replace(/\s*\|\s*(?:official|t-series|sony|zee|saregama|svf|speed|tips|anupam|g-series|eagle).*$/gi, " ");
  s = s.replace(/^(?:lyrical|audio|video|official\s*(?:video|audio|music\s*video))\s*:\s*/gi, "");

  // 4. Remove standalone noise words/phrases
  s = s.replace(/\b(?:official\s*(?:music\s*)?video|official\s*audio|official|lyrics?|lyrical|visualizer|music\s*video|full\s*video|full\s*song|4k|8k|hd|hq|1080p|720p|60fps|remastered|extended|original\s*mix|audio|song|video|shorts|tiktok)\b/gi, " ");

  // 5. Replace all non-alphanumeric characters (except spaces) with space
  // Keep unicode alphanumeric characters across all languages (\p{L}\p{N})
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");

  // 6. Condense extra whitespace and trim
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Extracts clean core alphanumeric words from a title or artist string.
 */
export function extractCoreWords(text: string): string[] {
  const norm = normalizeCoreTitle(text);
  if (!norm) return [];
  return norm.split(/\s+/).filter((w) => w.length > 0);
}

/**
 * Extracts the core root song title by stripping leading modifiers ("Soul of", "Cover by", etc.),
 * bracketed noise, remix/variation/version keywords, emojis, special characters, and extra spaces.
 * E.g., "Soul of Tera Mera Rishta", "Tera Mera Rishta 2.0", "Tera Mera Rishta [Lofi]" -> "tera mera rishta"
 */
export function extractCoreSongRoot(title: string): string {
  if (!title) return "";
  let s = decodeHtmlEntities(title).toLowerCase();

  // 1. Remove URLs and hashtags
  s = s.replace(/https?:\/\/\S+/gi, "").replace(/#\w+/gi, "");

  // 2. Strip bracketed & parenthesized noise / tags
  s = s.replace(/\[[^\]]*\]/g, " ");
  s = s.replace(/\([^)]*\)/g, " ");

  // 3. Remove separator noise after pipes | or hyphens with production/labels/official
  s = s.replace(/\s*\|\s*(?:official|t-series|sony|zee|saregama|svf|speed|tips|anupam|g-series|eagle).*$/gi, " ");

  // 3b. If title is formatted as "Artist - Title", strip the artist prefix if there is a clear dash separator
  if (/^[^\-–—]{2,30}\s*[\-–—]\s*[^\-–—]+$/i.test(s)) {
    const parts = s.split(/\s*[\-–—]\s*/);
    if (parts.length === 2 && parts[1].trim().length >= 2) {
      s = parts[1].trim();
    }
  }

  // 4. Strip leading prefixes like "Soul of", "Heart of", "Tribute to", "Cover by", "Best of", "New version of"
  s = s.replace(
    /^(?:the\s+)?(?:soul\s+of|heart\s+of|tribute\s+to|cover\s+(?:by|of)?|best\s+of|sounds\s+of|new\s+version(?:\s+of)?|female\s+version(?:\s+of)?|male\s+version(?:\s+of)?|sad\s+version(?:\s+of)?|acoustic\s+version(?:\s+of)?|reprise(?:\s+of)?|remix(?:\s+of)?)\s*[:\-–—]?\s*/gi,
    ""
  );

  // 5. Remove common remix / variation / noise keywords
  s = s.replace(
    /\b(?:remix(?:ed)?|lofi|lo-fi|slowed(?:\s*(?:and|&|\+)\s*reverb)?|slow|reverb|sped\s*up|speed\s*up|nightcore|bass\s*boosted|boosted|8d\s*audio|clean|explicit|extended|original\s*mix|club\s*mix|dj\s*mix|mashup|cover|acoustic|unplugged|female\s*version|male\s*version|new\s*version|sad\s*version|reprise|instrumental|karaoke|soundtrack|ost|audio|video|official|lyrics?|lyrical|full\s*song|full\s*video|version|edit|vibe|vibes|2\.0|3\.0|4\.0|hd|hq|4k|8k|1080p|720p|60fps|prod\.|feat\.|ft\.|duet)\b/gi,
    " "
  );

  // 6. Keep unicode alphanumeric characters (\p{L}\p{N}) across all languages
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");

  // 7. Collapse spaces and trim
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Calculates Levenshtein distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (!s1.length) return s2.length;
  if (!s2.length) return s1.length;

  const d: number[][] = [];
  for (let i = 0; i <= s1.length; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return d[s1.length][s2.length];
}

/**
 * Calculates fuzzy similarity score (0.0 to 1.0) between two song titles based on:
 * 1. Normalized Core Root exact matching
 * 2. Token overlap (Dice coefficient)
 * 3. Character Levenshtein distance
 * 4. Substring containment
 */
export function calculateTitleSimilarity(titleA: string, titleB: string): number {
  const rootA = extractCoreSongRoot(titleA);
  const rootB = extractCoreSongRoot(titleB);

  if (!rootA || !rootB) return 0;
  if (rootA === rootB) return 1.0;

  // 1. Token-level Dice similarity
  const tokensA = rootA.split(/\s+/).filter(Boolean);
  const tokensB = rootB.split(/\s+/).filter(Boolean);

  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setB = new Set(tokensB);
  const intersection = tokensA.filter((t) => setB.has(t)).length;
  const dice = (2 * intersection) / (tokensA.length + tokensB.length);

  // 2. Character Levenshtein similarity
  const maxLen = Math.max(rootA.length, rootB.length);
  const levDist = levenshteinDistance(rootA, rootB);
  const levSim = maxLen > 0 ? 1 - levDist / maxLen : 0;

  // 3. Substring containment check: if shorter root (min 4 chars) is fully contained in longer root
  const shorter = rootA.length <= rootB.length ? rootA : rootB;
  const longer = rootA.length <= rootB.length ? rootB : rootA;
  const containment = shorter.length >= 4 && longer.includes(shorter) ? shorter.length / longer.length : 0;

  return Math.max(dice, levSim, containment);
}

/**
 * Returns true if two song titles represent variations / remixes of the same core song (>70% similarity)
 */
export function isSameCoreSong(titleA: string, titleB: string, threshold = 0.70): boolean {
  if (!titleA || !titleB) return false;
  return calculateTitleSimilarity(titleA, titleB) >= threshold;
}

/**
 * Deduplicates tracks to strictly enforce at most 1 variation/remix/version per core song.
 */
export function deduplicateCoreSongVariations<T extends DedupeTrackInput>(
  tracks: T[],
  threshold = 0.70
): T[] {
  if (!Array.isArray(tracks) || tracks.length <= 1) {
    return tracks || [];
  }

  const result: T[] = [];
  const seenCoreRoots: string[] = [];

  for (const track of tracks) {
    if (!track) continue;
    const title = track.title || "";
    const coreRoot = extractCoreSongRoot(title);

    if (!coreRoot) {
      result.push(track);
      continue;
    }

    let isDuplicate = false;
    for (let i = 0; i < seenCoreRoots.length; i++) {
      if (isSameCoreSong(seenCoreRoots[i], coreRoot, threshold)) {
        isDuplicate = true;
        // Check if current candidate has a higher official score than existing
        const currentScore = getOfficialContentScore(
          result[i].artist || result[i].channel || result[i].channelTitle || "",
          result[i].title || ""
        );
        const newScore = getOfficialContentScore(
          track.artist || track.channel || track.channelTitle || "",
          track.title || ""
        );
        if (newScore >= currentScore + 25) {
          result[i] = track;
          seenCoreRoots[i] = coreRoot;
        }
        break;
      }
    }

    if (!isDuplicate) {
      result.push(track);
      seenCoreRoots.push(coreRoot);
    }
  }

  return result;
}

export type DedupeTrackInput = {
  id?: string;
  youtubeVideoId?: string;
  title?: string;
  artist?: string;
  channel?: string;
  channelTitle?: string;
  duration?: number | string;
  [key: string]: any;
};

/**
 * Helper to parse any duration representation (number in sec or string like '3:45' or ISO 'PT3M45S') to seconds
 */
function parseTrackDurationToSeconds(dur?: number | string): number {
  if (typeof dur === "number" && dur > 0) {
    return Math.round(dur);
  }
  if (typeof dur === "string" && dur.trim()) {
    const trimmed = dur.trim();
    if (trimmed.includes(":")) {
      const parts = trimmed.split(":").map((p) => parseInt(p, 10));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return parts[0] * 60 + parts[1];
      }
      if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      }
    }
    const isoSec = parseYouTubeDuration(trimmed);
    if (isoSec > 0) return isoSec;
    const num = parseFloat(trimmed);
    if (!isNaN(num) && num > 0) return Math.round(num);
  }
  return 0;
}

/**
 * Determines if two YouTube track entries are duplicates or near-duplicates.
 * Considers:
 * 1. Matching YouTube video IDs.
 * 2. Normalized core titles matching AND duration within ±3 seconds.
 * 3. Normalized title of one track contained in the other AND artist/duration matching closely.
 * 4. Combined artist + title token overlap with matching duration.
 */
export function areTracksDuplicate(a: DedupeTrackInput, b: DedupeTrackInput): boolean {
  if (!a || !b) return false;

  // 1. Direct ID match
  const idA = (a.youtubeVideoId || a.id || "").replace(/^yt-/, "").trim().toLowerCase();
  const idB = (b.youtubeVideoId || b.id || "").replace(/^yt-/, "").trim().toLowerCase();
  if (idA && idB && idA === idB) {
    return true;
  }

  // Duration comparison
  const durA = parseTrackDurationToSeconds(a.duration);
  const durB = parseTrackDurationToSeconds(b.duration);
  const hasRealDurA = durA > 0 && durA !== 210;
  const hasRealDurB = durB > 0 && durB !== 210;
  const durationDiff = Math.abs(durA - durB);

  // If both tracks have validated non-placeholder durations and difference is large (> 4s),
  // they are likely different recordings / versions.
  if (hasRealDurA && hasRealDurB && durationDiff > 4) {
    return false;
  }

  const titleA = a.title || "";
  const titleB = b.title || "";
  const artistA = a.artist || a.channel || a.channelTitle || "";
  const artistB = b.artist || b.channel || b.channelTitle || "";

  const normTitleA = normalizeCoreTitle(titleA);
  const normTitleB = normalizeCoreTitle(titleB);

  if (!normTitleA || !normTitleB) {
    return false;
  }

  const normArtistA = normalizeCoreTitle(artistA);
  const normArtistB = normalizeCoreTitle(artistB);

  const durationMatches = (!hasRealDurA || !hasRealDurB) || durationDiff <= 3;

  // Condition 1: Exact normalized core titles match
  if (normTitleA === normTitleB) {
    // If duration matches within ±3s, it's a duplicate
    if (durationMatches) {
      return true;
    }
  }

  // Condition 2: Title containment (e.g. "metamorphosis" inside "interworld metamorphosis")
  const shortTitle = normTitleA.length <= normTitleB.length ? normTitleA : normTitleB;
  const longTitle = normTitleA.length <= normTitleB.length ? normTitleB : normTitleA;
  const shortArtist = normTitleA.length <= normTitleB.length ? normArtistA : normArtistB;
  const longArtist = normTitleA.length <= normTitleB.length ? normArtistB : normArtistA;

  if (shortTitle.length >= 3 && longTitle.includes(shortTitle)) {
    // Check if extra words in longTitle match shortArtist or longArtist
    const extraWords = longTitle.replace(shortTitle, "").trim();
    const artistMatches =
      (shortArtist && longArtist && (shortArtist === longArtist || shortArtist.includes(longArtist) || longArtist.includes(shortArtist))) ||
      (shortArtist && extraWords && (shortArtist.includes(extraWords) || extraWords.includes(shortArtist))) ||
      (longArtist && extraWords && (longArtist.includes(extraWords) || extraWords.includes(longArtist)));

    if (durationMatches && (artistMatches || durationDiff <= 2)) {
      return true;
    }
  }

  // Condition 3: Combined words signature (e.g. artist + title matching in different orders)
  const wordsA = new Set([...extractCoreWords(titleA), ...extractCoreWords(artistA)]);
  const wordsB = new Set([...extractCoreWords(titleB), ...extractCoreWords(artistB)]);

  const titleWordsA = extractCoreWords(titleA);
  const titleWordsB = extractCoreWords(titleB);

  if (titleWordsA.length > 0 && titleWordsB.length > 0) {
    const aAllInB = titleWordsA.every((w) => wordsB.has(w));
    const bAllInA = titleWordsB.every((w) => wordsA.has(w));

    if (aAllInB && bAllInA && durationMatches) {
      return true;
    }
  }

  return false;
}

/**
 * Deduplicates an array of YouTube tracks/songs, keeping the first/cleanest occurrence.
 */
export function deduplicateYouTubeTracks<T extends DedupeTrackInput>(tracks: T[]): T[] {
  if (!Array.isArray(tracks) || tracks.length <= 1) {
    return tracks || [];
  }

  const result: T[] = [];

  for (const track of tracks) {
    if (!track) continue;

    let isDuplicate = false;
    for (let i = 0; i < result.length; i++) {
      if (areTracksDuplicate(result[i], track)) {
        isDuplicate = true;
        // Check if the new track is higher quality / cleaner than the existing one
        const currentScore = getOfficialContentScore(
          result[i].artist || result[i].channel || result[i].channelTitle || "",
          result[i].title || ""
        );
        const newScore = getOfficialContentScore(
          track.artist || track.channel || track.channelTitle || "",
          track.title || ""
        );

        // If new candidate has significantly better official score (+30), prefer it
        if (newScore >= currentScore + 30) {
          result[i] = track;
        }
        break;
      }
    }

    if (!isDuplicate) {
      result.push(track);
    }
  }

  return result;
}

export interface MevoNormalizedSong extends Song {
  youtubeVideoId: string;
  channel: string;
  thumbnail: string;
  duration: number;
  language: string;
  genre: string;
  mood: string;
  category: string;
  publishedAt?: string;
  tags?: string[];
  isOfficial?: boolean;
  musicType?: "official_audio" | "official_video" | "lyric_video" | "track" | "other";
}

/**
 * Normalizes any YouTube API or Extractor result into a canonical MevoNormalizedSong
 */
export function normalizeYouTubeSong(
  video: {
    id: string;
    title: string;
    channelTitle: string;
    thumbnail: string;
    duration?: number;
    viewCount?: number;
    publishedAt?: string;
    description?: string;
  },
  sectionId: SectionId = "bangla",
  categoryTitle = "Music",
  options: { trending?: boolean } = {}
): MevoNormalizedSong {
  const cleanId = (video.id || "").replace(/^yt-/, "").trim();
  const { title, artist } = cleanYouTubeTitle(video.title, video.channelTitle);
  const streamUrl = getYouTubeStreamUrl(cleanId);
  const year = video.publishedAt ? new Date(video.publishedAt).getFullYear() : new Date().getFullYear();
  const duration = typeof video.duration === "number" && video.duration > 0 ? Math.round(video.duration) : 210;
  const bestCover = video.thumbnail || `https://img.youtube.com/vi/${cleanId}/hqdefault.jpg`;

  const officialScore = getOfficialContentScore(video.channelTitle, video.title);
  const isOfficial = officialScore >= 60;
  const titleLower = video.title.toLowerCase();
  const musicType = titleLower.includes("official audio") || video.channelTitle.toLowerCase().includes("- topic")
    ? "official_audio"
    : titleLower.includes("official music video") || titleLower.includes("official video")
      ? "official_video"
      : titleLower.includes("lyric")
        ? "lyric_video"
        : "track";

  const language =
    sectionId === "bangla"
      ? "bangla"
      : sectionId === "hindi"
        ? "hindi"
        : sectionId === "english"
          ? "english"
          : sectionId === "boost-aura"
            ? "phonk"
            : "global";

  const genre =
    sectionId === "bangla"
      ? "Bangla"
      : sectionId === "hindi"
        ? "Hindi"
        : sectionId === "english"
          ? "English"
          : sectionId === "boost-aura"
            ? "Phonk"
            : "Pop";

  const mood =
    sectionId === "boost-aura"
      ? "High-Energy"
      : sectionId === "hindi"
        ? "Romantic Melodic"
        : sectionId === "bangla"
          ? "Indie Acoustic"
          : "Upbeat Discovery";

  return {
    id: `yt-${cleanId}`,
    youtubeVideoId: cleanId,
    title,
    artist,
    album: categoryTitle,
    genre,
    year,
    duration,
    cover: bestCover,
    audio: streamUrl,
    section: sectionId,
    category: categoryTitle,
    trending: options.trending ?? false,
    plays: video.viewCount || 0,
    created_at: video.publishedAt || new Date().toISOString(),
    channel: video.channelTitle,
    thumbnail: bestCover,
    language,
    mood,
    publishedAt: video.publishedAt,
    isOfficial,
    musicType,
  };
}

/**
 * Converts a YouTube Video detail into a fully-compliant MEVO Song (PlayerSong)
 */
export function youTubeVideoToPlayerSong(
  video: {
    id: string;
    title: string;
    channelTitle: string;
    thumbnail: string;
    duration?: number;
    viewCount?: number;
    publishedAt?: string;
  },
  sectionId: SectionId,
  categoryTitle: string,
  options: { trending?: boolean } = {}
): Song {
  return normalizeYouTubeSong(video, sectionId, categoryTitle, options);
}

interface YouTubeApiItem {
  id: string | { kind?: string; videoId?: string };
  snippet?: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
    categoryId?: string;
    thumbnails: {
      default?: { url: string };
      medium?: { url: string };
      high?: { url: string };
      standard?: { url: string };
      maxres?: { url: string };
    };
  };
  contentDetails?: {
    duration?: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
  };
  status?: {
    madeForKids?: boolean;
    selfDeclaredMadeForKids?: boolean;
  };
}

interface YouTubeApiResponse {
  items?: YouTubeApiItem[];
  nextPageToken?: string;
  prevPageToken?: string;
  error?: {
    code: number;
    message: string;
    errors?: Array<{ message: string; reason: string }>;
  };
}

/**
 * Fallback to local Python Flask Extractor search endpoint
 */
async function fetchFromExtractor(
  query: string,
  limit = 25,
  sectionId: SectionId = "bangla",
  categoryTitle = "Category",
  options: { trending?: boolean } = {}
): Promise<Song[]> {
  try {
    const baseUrl = getExtractorBaseUrl();
    const endpoint = `${baseUrl}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(endpoint);
    if (!res.ok) return [];

    const data = await res.json();
    const items = data.items || [];
    const songs: Song[] = [];

    for (const item of items) {
      if (!item.id) continue;
      const title = decodeHtmlEntities(item.title || "");
      const channel = decodeHtmlEntities(item.artist || item.channelTitle || item.uploader || "");
      const duration = typeof item.duration === "number" ? item.duration : 0;
      const desc = item.description || "";

      if (!isMusicContent(title, channel, desc, duration)) {
        continue;
      }

      const song = youTubeVideoToPlayerSong(
        {
          id: item.id,
          title,
          channelTitle: channel,
          thumbnail: item.thumbnail || `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`,
          duration,
          viewCount: item.viewCount || item.view_count || 0,
          publishedAt: item.publishedAt,
        },
        sectionId,
        categoryTitle,
        options
      );

      songs.push(song);
    }

    return deduplicateYouTubeTracks(songs);
  } catch (err) {
    console.warn("fetchFromExtractor error:", err);
    return [];
  }
}

/**
 * Batch fetches video details (duration, viewCount, HD thumbnails) for a list of video IDs via Backend Batch Details endpoint
 */
export async function fetchYouTubeVideoDetails(videoIds: string[]): Promise<Map<string, YouTubeVideoDetail>> {
  const map = new Map<string, YouTubeVideoDetail>();
  if (videoIds.length === 0) return map;

  const cacheKey = `batch-details:${videoIds.sort().join(",")}`;
  return fetchWithSingleFlight(cacheKey, async () => {
    const baseUrl = getExtractorBaseUrl();
    try {
      const endpoint = `${baseUrl}/api/youtube/videos?ids=${encodeURIComponent(videoIds.join(","))}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        const itemsMap = data.items || {};
        for (const vidId of Object.keys(itemsMap)) {
          const item = itemsMap[vidId];
          map.set(vidId, {
            id: vidId,
            title: decodeHtmlEntities(item.title || ""),
            channelTitle: decodeHtmlEntities(item.channelTitle || ""),
            thumbnail: item.thumbnail || `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`,
            description: item.description || "",
            publishedAt: item.publishedAt || "",
            duration: item.duration || 0,
            viewCount: item.viewCount || 0,
          });
        }
      }
    } catch (err) {
      console.warn("[fetchYouTubeVideoDetails] Error fetching details batch:", err);
    }
    return map;
  });
}

/**
 * Fetches MEVO Pulse Custom Blended Trending Feed via Backend Trending endpoint
 * Dominated by Hindi Hits, Global English Hits, Phonk, and Sonic World (K-Pop/Latin) with Top Bangla Hits.
 */
export async function fetchYouTubeTrending(
  regionCode = "BD",
  maxResults = 50,
  sectionId: SectionId = "bangla",
  categoryTitle = "MEVO Pulse"
): Promise<Song[]> {
  const cacheKey = `trending:${regionCode}:${maxResults}:${sectionId}`;
  return fetchWithSingleFlight<Song[]>(cacheKey, async (): Promise<Song[]> => {
    const baseUrl = getExtractorBaseUrl();
    try {
      const res = await fetch(
        `${baseUrl}/api/youtube/trending?region=${encodeURIComponent(regionCode)}&limit=${maxResults}&sectionId=${encodeURIComponent(sectionId)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.items) && data.items.length > 0) {
          const songs: Song[] = data.items.map((it: any) =>
            youTubeVideoToPlayerSong(
              {
                id: it.id,
                title: it.title,
                channelTitle: it.artist || it.channelTitle || it.uploader,
                thumbnail: it.thumbnail,
                duration: it.duration,
                viewCount: it.viewCount || it.view_count || 0,
                publishedAt: it.publishedAt,
              },
              (it.section as SectionId) || sectionId,
              categoryTitle,
              { trending: true }
            )
          );
          return deduplicateYouTubeTracks(songs).slice(0, maxResults);
        }
      }
    } catch (err) {
      console.warn("[fetchYouTubeTrending] Backend trending error, attempting search fallback:", err);
    }

    // Fallback if /api/youtube/trending is temporarily unreachable
    const fallbackSongs = await fetchFromExtractor(
      "latest hindi bollywood english pop phonk official audio -billboard -top10 -top20 -top50 -top100 -recap -countdown",
      maxResults,
      sectionId,
      categoryTitle,
      { trending: true }
    );
    return deduplicateYouTubeTracks(fallbackSongs).slice(0, maxResults);
  });
}

/**
 * Fetches YouTube Category Music Tracks via Backend Category endpoint with single-flight deduplication.
 */
export async function fetchYouTubeCategoryTracks(
  query: string,
  order: "viewCount" | "relevance" = "viewCount",
  maxResults = 50,
  sectionId: SectionId = "bangla",
  categoryTitle = "Category",
  options: { trending?: boolean } = {}
): Promise<Song[]> {
  const cacheKey = `category:${query.trim().toLowerCase()}:${order}:${maxResults}:${sectionId}`;
  return fetchWithSingleFlight<Song[]>(cacheKey, async (): Promise<Song[]> => {
    const baseUrl = getExtractorBaseUrl();
    try {
      const endpoint = `${baseUrl}/api/youtube/category?q=${encodeURIComponent(query.trim())}&order=${order}&limit=${maxResults}&sectionId=${encodeURIComponent(sectionId)}&categoryTitle=${encodeURIComponent(categoryTitle)}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.songs) && data.songs.length > 0) {
          const songs: Song[] = data.songs.map((it: any) =>
            youTubeVideoToPlayerSong(
              {
                id: it.id,
                title: it.title,
                channelTitle: it.artist || it.channelTitle || it.uploader,
                thumbnail: it.thumbnail,
                duration: it.duration,
                viewCount: it.viewCount || it.view_count || 0,
                publishedAt: it.publishedAt,
              },
              sectionId,
              categoryTitle,
              { trending: options.trending ?? false }
            )
          );
          return deduplicateYouTubeTracks(songs).slice(0, maxResults);
        }
      }
    } catch (err) {
      console.warn(`[fetchYouTubeCategoryTracks] Backend category error for "${query}":`, err);
    }

    // Fallback to /api/search via fetchFromExtractor
    const cleanSearchQuery = query.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
    const fallbackSongs = await fetchFromExtractor(
      cleanSearchQuery,
      maxResults,
      sectionId,
      categoryTitle,
      { trending: options.trending ?? false }
    );
    return deduplicateYouTubeTracks(fallbackSongs).slice(0, maxResults);
  });
}

/**
 * Searches YouTube for tracks/videos matching the query string via Backend Search API
 */
export async function searchYouTube(query: string, maxResults = 12): Promise<YouTubeSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const cacheKey = `search:${trimmed.toLowerCase()}:${maxResults}`;
  return fetchWithSingleFlight(cacheKey, async () => {
    try {
      const baseUrl = getExtractorBaseUrl();
      const endpoint = `${baseUrl}/api/search?q=${encodeURIComponent(trimmed)}&limit=${maxResults}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        const results: YouTubeSearchResult[] = (data.items || [])
          .map((item: any) => ({
            id: item.id,
            title: decodeHtmlEntities(item.title || ""),
            channel: decodeHtmlEntities(item.artist || item.channelTitle || item.uploader || ""),
            thumbnail: item.thumbnail || `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`,
            description: item.description || "",
            publishedAt: item.publishedAt,
            duration: item.duration,
            viewCount: item.viewCount || item.view_count || 0,
          }))
          .filter((item: YouTubeSearchResult) =>
            isMusicContent(item.title, item.channel, item.description, item.duration || 0)
          )
          .sort((a: YouTubeSearchResult, b: YouTubeSearchResult) => getOfficialContentScore(b.channel, b.title) - getOfficialContentScore(a.channel, a.title));

        return deduplicateYouTubeTracks(results).slice(0, maxResults);
      }
    } catch (err) {
      console.error("[searchYouTube] Backend search error:", err);
    }

    return [];
  });
}

export interface PaginatedYouTubeSongs {
  songs: Song[];
  nextPageToken?: string | null;
}

export const SECTION_QUERY_EXPANSIONS: Record<string, string[]> = {
  bangla: [
    "bangla songs official audio | bangla band official audio",
    "top bangla new hits official audio track",
    "popular bangla romantic acoustic official audio songs",
    "bangla rock folk fusion official music audio",
    "best bangla studio songs official audio release",
  ],
  "bengal-echo": [
    "bangla songs official audio | bangla band official audio",
    "top bangla new hits official audio track",
    "popular bangla romantic acoustic official audio songs",
    "bangla rock folk fusion official music audio",
    "best bangla studio songs official audio release",
  ],
  "bangla-beats": [
    "bangla songs official audio | bangla band official audio",
    "top bangla new hits official audio track",
    "popular bangla romantic acoustic official audio songs",
    "bangla rock folk fusion official music audio",
    "best bangla studio songs official audio release",
  ],
  hindi: [
    "latest hindi official audio songs | bollywood official audio",
    "trending romantic hindi songs official audio",
    "soulful bollywood melodies official audio songs",
    "hindi unplugged acoustic official audio songs",
    "top hindi pop tracks official audio",
  ],
  "hindi-reverie": [
    "latest hindi official audio songs | bollywood official audio",
    "trending romantic hindi songs official audio",
    "soulful bollywood melodies official audio songs",
    "hindi unplugged acoustic official audio songs",
    "top hindi pop tracks official audio",
  ],
  "soft-hindi-vibes": [
    "latest hindi official audio songs | bollywood official audio",
    "trending romantic hindi songs official audio",
    "soulful bollywood melodies official audio songs",
    "hindi unplugged acoustic official audio songs",
    "top hindi pop tracks official audio",
  ],
  english: [
    "english pop official audio songs | viral english songs",
    "top billboard english pop hits official audio",
    "global acoustic chill english songs official audio",
    "trending international pop hits official audio",
    "new english radio songs official audio",
  ],
  "english-essence": [
    "english pop official audio songs | viral english songs",
    "top billboard english pop hits official audio",
    "global acoustic chill english songs official audio",
    "trending international pop hits official audio",
    "new english radio songs official audio",
  ],
  "boost-aura": [
    "drift phonk official audio | phonk music official audio",
    "brazilian phonk viral official audio tracks",
    "aggressive drift phonk bass boosted audio",
    "gym workout phonk montage official audio",
    "phonk dark ambient speed up official audio",
  ],
  global: [
    "kpop official audio | latin viral official audio",
    "afrobeats viral hits official audio",
    "jpop trending official audio tracks",
    "global fusion world music official audio",
  ],
  "sonic-world": [
    "kpop official audio | latin viral official audio",
    "afrobeats viral hits official audio",
    "jpop trending official audio tracks",
    "global fusion world music official audio",
  ],
  "global-tracks": [
    "kpop official audio | latin viral official audio",
    "afrobeats viral hits official audio",
    "jpop trending official audio tracks",
    "global fusion world music official audio",
  ],
  trending: [
    "top trending hindi bollywood english pop phonk viral official audio",
    "global viral chart top tracks official audio",
    "trending popular world hits official music audio",
  ],
  "mevo-pulse": [
    "top trending hindi bollywood english pop phonk viral official audio",
    "global viral chart top tracks official audio",
    "trending popular world hits official music audio",
  ],
};

/**
 * Fetches batches of songs (e.g. 16-20 tracks) for dedicated section view with continuous nextPageToken and strict duration bounds.
 */
export async function fetchPaginatedYouTubeCategoryTracks(
  query: string,
  order: "viewCount" | "relevance" = "viewCount",
  targetCount = 20,
  pageToken?: string | null,
  sectionId: SectionId = "bangla",
  categoryTitle = "Category"
): Promise<PaginatedYouTubeSongs> {
  const cacheKey = `paginated:${query.trim().toLowerCase()}:${order}:${targetCount}:${pageToken || "0"}:${sectionId}`;
  return fetchWithSingleFlight(cacheKey, async () => {
    let accumulated: Song[] = [];
    let nextToken: string | null | undefined = null;

    // Resolve query expansion index if present in token (e.g. "exp:1:CDIQAA" or "exp:2:offset:40")
    let activeQuery = query;
    let rawPageToken = pageToken || undefined;
    let queryExpIndex = 0;

    const expansions = SECTION_QUERY_EXPANSIONS[sectionId] || SECTION_QUERY_EXPANSIONS[categoryTitle.toLowerCase()] || [];

    if (pageToken && pageToken.startsWith("exp:")) {
      const parts = pageToken.split(":");
      queryExpIndex = parseInt(parts[1], 10) || 0;
      rawPageToken = parts.slice(2).join(":");
      if (rawPageToken === "start" || !rawPageToken) {
        rawPageToken = undefined;
      }
      if (expansions[queryExpIndex]) {
        activeQuery = expansions[queryExpIndex];
      }
    }

    const baseUrl = getExtractorBaseUrl();

    // 1. Try Backend Category endpoint
    try {
      let endpoint = `${baseUrl}/api/youtube/category?q=${encodeURIComponent(activeQuery.trim())}&order=${order}&limit=${targetCount}&sectionId=${encodeURIComponent(sectionId)}&categoryTitle=${encodeURIComponent(categoryTitle)}`;
      if (rawPageToken) {
        endpoint += `&pageToken=${encodeURIComponent(rawPageToken)}`;
      }

      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.songs) && data.songs.length > 0) {
          const ytNextToken = data.nextPageToken;
          if (ytNextToken) {
            nextToken = queryExpIndex > 0 ? `exp:${queryExpIndex}:${ytNextToken}` : ytNextToken;
          } else if (queryExpIndex + 1 < expansions.length) {
            nextToken = `exp:${queryExpIndex + 1}:start`;
          }

          const songs = data.songs.map((it: any) =>
            youTubeVideoToPlayerSong(
              {
                id: it.id,
                title: it.title,
                channelTitle: it.artist || it.channelTitle || it.uploader,
                thumbnail: it.thumbnail,
                duration: it.duration,
                viewCount: it.viewCount || it.view_count || 0,
                publishedAt: it.publishedAt,
              },
              sectionId,
              categoryTitle,
              { trending: false }
            )
          );
          accumulated.push(...songs);
        }
      }
    } catch (err) {
      console.warn("[fetchPaginatedYouTubeCategoryTracks] Backend category error, attempting search fallback:", err);
    }

    // 2. Fallback to backend search endpoint if no tracks accumulated
    if (accumulated.length === 0) {
      try {
        const cleanSearchQuery = activeQuery.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
        let endpoint = `${baseUrl}/api/search?q=${encodeURIComponent(cleanSearchQuery)}&limit=${Math.max(targetCount, 25)}`;
        if (rawPageToken) {
          endpoint += `&pageToken=${encodeURIComponent(rawPageToken)}`;
        }
        const res = await fetch(endpoint);
        if (res.ok) {
          const data = await res.json();
          const items = data.items || [];
          const extNextToken = data.nextPageToken;

          if (extNextToken) {
            nextToken = queryExpIndex > 0 ? `exp:${queryExpIndex}:${extNextToken}` : extNextToken;
          } else if (queryExpIndex + 1 < expansions.length) {
            nextToken = `exp:${queryExpIndex + 1}:start`;
          }

          for (const item of items) {
            if (!item.id) continue;
            const title = decodeHtmlEntities(item.title || "");
            const channel = decodeHtmlEntities(item.artist || item.channelTitle || item.uploader || "");
            const duration = typeof item.duration === "number" ? item.duration : 0;
            const desc = item.description || "";

            if (!isMusicContent(title, channel, desc, duration)) {
              continue;
            }

            const song = youTubeVideoToPlayerSong(
              {
                id: item.id,
                title,
                channelTitle: channel,
                thumbnail: item.thumbnail || `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`,
                duration,
                viewCount: item.viewCount || item.view_count || 0,
                publishedAt: item.publishedAt,
              },
              sectionId,
              categoryTitle,
              { trending: false }
            );

            accumulated.push(song);
          }
        }
      } catch (err) {
        console.warn("fetchPaginatedYouTubeCategoryTracks extractor fallback error:", err);
      }
    }

    // Deduplicate
    const deduped = deduplicateYouTubeTracks(accumulated);

    // If we found songs but token is missing, generate fallback continuous expansion token
    if (!nextToken && deduped.length > 0) {
      if (queryExpIndex + 1 < expansions.length) {
        nextToken = `exp:${queryExpIndex + 1}:start`;
      } else {
        nextToken = `exp:${queryExpIndex}:offset:${targetCount}`;
      }
    }

    return {
      songs: deduped.slice(0, targetCount),
      nextPageToken: nextToken || null,
    };
  });
}
