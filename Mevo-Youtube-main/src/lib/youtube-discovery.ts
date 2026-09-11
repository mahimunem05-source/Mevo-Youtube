/**
 * Centralized YouTube Music Discovery, Validation & Dynamic Ranking Engine
 * Enforces strict section identities, language classification, shorts filtering,
 * playability checks, and a balanced freshness + current popularity ranking model.
 */

import type { SectionId, Song } from "@/data/songs";
import { getOfficialContentScore } from "@/services/youtube";

// ---------------------------------------------------------------------------
// 1. Language & Section Content Classification
// ---------------------------------------------------------------------------

// Unicode Script Regexes
const BENGALI_SCRIPT = /[\u0980-\u09FF]/;
const DEVANAGARI_SCRIPT = /[\u0900-\u097F]/;
const GURMUKHI_SCRIPT = /[\u0A00-\u0A7F]/;
const ARABIC_SCRIPT = /[\u0600-\u06FF]/;
const TAMIL_SCRIPT = /[\u0B80-\u0BFF]/;
const TELUGU_SCRIPT = /[\u0C00-\u0C7F]/;
const MALAYALAM_SCRIPT = /[\u0D00-\u0D7F]/;
const KOREAN_SCRIPT = /[\uAC00-\uD7AF\u1100-\u11FF]/;
const JAPANESE_SCRIPT = /[\u3040-\u30FF\u31F0-\u31FF\u4E00-\u9FAF]/;
const CYRILLIC_SCRIPT = /[\u0400-\u04FF]/;

// Verified Bangla Artists, Bands, Labels & Keywords
const BANGLA_ARTISTS_AND_KEYWORDS = [
  "bangla", "bengali", "rabindra", "nazrul", "lalon", "artcell", "warfaze",
  "aurthohin", "shironamhin", "bappa mazumder", "tahsan", "minar", "habib wahid",
  "arifin shuvo", "somlata", "anupam roy", "fossils", "cactus", "james", "nagar baul",
  "ayub bachchu", "lrb", "miles", "shunno", "chirkutt", "meghdol", "asheq", "papon",
  "arnob", "baul", "bhatiyali", "konal", "imran mahmudul", "pritom hasan", "odd signature",
  "level five", "avoidrafa", "karnival", "conclusion", "dhruba", "svf music", "g-series",
  "eagle music", "anupam recording", "soundtek", "cmv", "rtv music", "laser vision",
  "gaan", "gaan baul", "bangla song", "bangla gaan", "coke studio bangla", "bhalobasha",
  "shadhin", "kolkata bangla", "moner manush", "ekhon ami", "mayabi", "shreya ghoshal bangla",
];

// Verified Hindi & Bollywood Artists, Labels & Keywords
const HINDI_ARTISTS_AND_KEYWORDS = [
  "hindi", "bollywood", "arijit singh", "arijit", "pritam", "shreya ghoshal",
  "atif aslam", "jubin nautiyal", "neha kakkar", "badshah", "vishal mishra",
  "armaan malik", "darshan raval", "t-series", "zee music", "yrf", "yash raj",
  "sonu nigam", "alka yagnik", "kumar sanu", "kishore kumar", "lata mangeshkar",
  "sunidhi chauhan", "anuv jain", "jasleen royal", "mohit chauhan", "rahat fateh ali khan",
  "kk", "honey singh", "king", "diljit dosanjh", "guru randhawa", "b praak",
  "sachet parampara", "tulsi kumar", "monali thakur", "shankar ehsaan loy",
  "saregama music", "tips official", "speed records", "sony music india",
  "dhvani bhanushali", "stebin ben", "javed ali", "amit trivedi", "zaeden", "prateek kuhad",
  "shaan", "himesh reshammiya", "mithoon", "rochak kohli", "tanishk bagchi",
];

// Verified English Artists, Labels & Keywords
const ENGLISH_ARTISTS_AND_KEYWORDS = [
  "the weeknd", "taylor swift", "drake", "billie eilish", "dua lipa", "ed sheeran",
  "bruno mars", "ariana grande", "justin bieber", "eminem", "post malone", "rihanna",
  "coldplay", "imagine dragons", "maroon 5", "charlie puth", "olivia rodrigo",
  "harry styles", "sam smith", "selena gomez", "katy perry", "shawn mendes",
  "adele", "beyonce", "lady gaga", "travis scott", "kanye", "kendrick lamar",
  "twenty one pilots", "the chainsmokers", "marshmello", "alan walker", "kygo",
  "david guetta", "calvin harris", "sabrina carpenter", "sza", "chappell roan",
  "tate mcrae", "benson boone", "teddy swims", "sabrina", "halsey", "miley cyrus",
  "republic records", "interscope", "atlantic records", "columbia records",
  "rca records", "def jam", "vevo", "english pop", "billboard", "grammy",
];

// Verified Phonk Keywords & Artists
const PHONK_KEYWORDS = [
  "drift phonk", "phonk", "brazilian phonk", "montagem", "memphis phonk",
  "wave phonk", "kordhell", "interworld", "dxrk", "dvrst", "hensonn",
  "shadxwbxrn", "gvescx", "pharmacist", "playaphonk", "ghostface playa",
  "sxid", "scooter", "cowbell", "funk bolha", "funk rj", "automotivo",
  "mishashi sensei", "slowboy", "hxvry", "prxsxnt fxnky", "plphonk",
  "shadow dance", "metamorphosis", "murder in my mind",
];

// Non-Phonk Generic Genres that should be rejected unless Phonk markers exist
const NON_PHONK_GENERIC = [
  "rap beat", "trap beat", "freestyle rap", "hip hop mix",
  "club edm", "festival edm", "techno rave", "deep house mix",
];

// International Languages / Genres for Sonic World
const INTERNATIONAL_KEYWORDS = [
  "kpop", "k-pop", "bts", "blackpink", "newjeans", "stray kids", "twice",
  "seventeen", "enhypen", "txt", "aespa", "le sserafim", "ive", "itzy",
  "illit", "babymonster", "riize", "zerobaseone", "kiss of life", "nct",
  "exo", "red velvet", "g-idle", "gidle", "ateez", "the boyz", "monsta x",
  "taeyeon", "iu", "jungkook", "jimin", "fujii kaze", "aimyon", "higedan",
  "king gnu", "vaundy", "creepy nuts", "mrs. green apple",
  "jpop", "j-pop", "yoasobi", "kenshi yonezu", "ado", "lisa", "radwimps",
  "anime ost", "vocaloid", "latin", "reggaeton", "reggaetón", "bad bunny", "karol g",
  "rosalia", "peso pluma", "j balvin", "rauw alejandro", "maluma", "feid",
  "ozuna", "daddy yankee", "anuel", "shakira", "luis fonsi", "becky g",
  "farruko", "myke towers", "bizarrap", "tiago pzk", "duki", "manuel turizo",
  "quevedo", "sebastian yatra", "camilo", "kali uchis", "latin pop", "urbano", "bachata",
  "afrobeats", "afrobeat", "amapiano", "burna boy", "rema", "ayra starr", "wizkid", "asake", "tems",
  "davido", "omah lay", "ckay", "fireboy", "tyla", "afropop",
  "french pop", "aya nakamura", "stromae", "indila", "gims", "kendji",
  "spanish pop", "brazilian pop", "anitta", "ludmilla", "bossa nova", "samba",
];

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  detectedLanguage?: string;
  reason?: string;
}

/**
 * Validates whether a candidate track genuinely belongs to the given section.
 * Enforces strict section identities:
 * - bengal-echo: Bangla ONLY
 * - hindi-reverie: Hindi ONLY
 * - english-essence: English ONLY
 * - sonic-world: International NON-Bangla, NON-Hindi, NON-English ONLY
 * - boost-aura: Authentic Phonk ONLY
 */
export function validateSectionEligibility(
  track: {
    title: string;
    artist: string;
    channelTitle?: string;
    description?: string;
  },
  sectionId: string
): ValidationResult {
  const normSection = sectionId.toLowerCase().replace(/^section-/, "");
  const text = `${track.title} ${track.artist} ${track.channelTitle || ""} ${track.description || ""}`.toLowerCase();

  // -------------------------------------------------------------------------
  // 1. Bengal Echo (Bangla Discovery)
  // -------------------------------------------------------------------------
  if (normSection === "bengal-echo" || normSection === "bangla") {
    // Immediate Rejection if non-Bangla scripts are detected
    if (DEVANAGARI_SCRIPT.test(text)) {
      return { isValid: false, confidence: 0, reason: "Devanagari script detected in Bengal Echo" };
    }
    if (GURMUKHI_SCRIPT.test(text) || TAMIL_SCRIPT.test(text) || TELUGU_SCRIPT.test(text) || MALAYALAM_SCRIPT.test(text)) {
      return { isValid: false, confidence: 0, reason: "Non-Bangla South Asian script detected" };
    }
    if (ARABIC_SCRIPT.test(text)) {
      return { isValid: false, confidence: 0, reason: "Arabic script detected in Bengal Echo" };
    }

    // Immediate Acceptance if Bengali Unicode script is present
    if (BENGALI_SCRIPT.test(text)) {
      return { isValid: true, confidence: 0.98, detectedLanguage: "bangla" };
    }

    // Check for Bangla artists, labels, or keywords
    let banglaMatches = 0;
    for (const kw of BANGLA_ARTISTS_AND_KEYWORDS) {
      if (text.includes(kw)) {
        banglaMatches++;
      }
    }

    if (banglaMatches >= 1) {
      return { isValid: true, confidence: Math.min(0.95, 0.6 + banglaMatches * 0.2), detectedLanguage: "bangla" };
    }

    // Uncertain result -> Reject to prevent English or Hindi leakage
    return { isValid: false, confidence: 0.2, reason: "Not confident track belongs to Bangla music" };
  }

  // -------------------------------------------------------------------------
  // 2. Hindi Reverie (Hindi Discovery)
  // -------------------------------------------------------------------------
  if (normSection === "hindi-reverie" || normSection === "hindi") {
    // Immediate Rejection if Bengali or Arabic script detected
    if (BENGALI_SCRIPT.test(text)) {
      return { isValid: false, confidence: 0, reason: "Bengali script detected in Hindi Reverie" };
    }
    if (ARABIC_SCRIPT.test(text)) {
      return { isValid: false, confidence: 0, reason: "Arabic script detected in Hindi Reverie" };
    }

    // Immediate Acceptance if Devanagari script is present
    if (DEVANAGARI_SCRIPT.test(text)) {
      return { isValid: true, confidence: 0.98, detectedLanguage: "hindi" };
    }

    // Check for Hindi artists, labels, or keywords
    let hindiMatches = 0;
    for (const kw of HINDI_ARTISTS_AND_KEYWORDS) {
      if (text.includes(kw)) {
        hindiMatches++;
      }
    }

    // Ensure it does not match Western English pop keywords exclusively
    const isWesternEnglish = ENGLISH_ARTISTS_AND_KEYWORDS.some((kw) => text.includes(kw));
    if (isWesternEnglish && hindiMatches === 0) {
      return { isValid: false, confidence: 0, reason: "Western English track rejected from Hindi Reverie" };
    }

    if (hindiMatches >= 1) {
      return { isValid: true, confidence: Math.min(0.95, 0.6 + hindiMatches * 0.2), detectedLanguage: "hindi" };
    }

    return { isValid: false, confidence: 0.2, reason: "Not confident track belongs to Hindi music" };
  }

  // -------------------------------------------------------------------------
  // 3. English Essence (English Discovery)
  // -------------------------------------------------------------------------
  if (normSection === "english-essence" || normSection === "english") {
    // Immediate Rejection of non-Latin scripts
    if (
      BENGALI_SCRIPT.test(text) ||
      DEVANAGARI_SCRIPT.test(text) ||
      ARABIC_SCRIPT.test(text) ||
      KOREAN_SCRIPT.test(text) ||
      JAPANESE_SCRIPT.test(text) ||
      CYRILLIC_SCRIPT.test(text)
    ) {
      return { isValid: false, confidence: 0, reason: "Non-Latin script detected in English Essence" };
    }

    // Reject South Asian artists
    const hasBanglaArtist = BANGLA_ARTISTS_AND_KEYWORDS.some((kw) => text.includes(kw));
    const hasHindiArtist = HINDI_ARTISTS_AND_KEYWORDS.some((kw) => text.includes(kw));
    if (hasBanglaArtist || hasHindiArtist) {
      return { isValid: false, confidence: 0, reason: "South Asian artist detected in English Essence" };
    }

    // Check for English pop signals
    let englishMatches = 0;
    for (const kw of ENGLISH_ARTISTS_AND_KEYWORDS) {
      if (text.includes(kw)) {
        englishMatches++;
      }
    }

    // English titles typically have high ASCII / Latin ratio
    const asciiCount = (text.match(/[a-z0-9\s]/g) || []).length;
    const asciiRatio = text.length > 0 ? asciiCount / text.length : 0;

    if (asciiRatio > 0.85) {
      return { isValid: true, confidence: englishMatches > 0 ? 0.95 : 0.75, detectedLanguage: "english" };
    }

    return { isValid: false, confidence: 0.3, reason: "Low English confidence" };
  }

  // -------------------------------------------------------------------------
  // 4. Sonic World (International non-Bangla, non-Hindi, non-English)
  // -------------------------------------------------------------------------
  if (normSection === "sonic-world" || normSection === "global") {
    // STRICT REJECTION of Bangla & Hindi
    if (BENGALI_SCRIPT.test(text) || BANGLA_ARTISTS_AND_KEYWORDS.some((kw) => text.includes(kw))) {
      return { isValid: false, confidence: 0, reason: "Bangla music rejected from Sonic World" };
    }
    if (DEVANAGARI_SCRIPT.test(text) || HINDI_ARTISTS_AND_KEYWORDS.some((kw) => text.includes(kw))) {
      return { isValid: false, confidence: 0, reason: "Hindi music rejected from Sonic World" };
    }

    // STRICT REJECTION of pure mainstream English pop
    const isMainstreamEnglish = ENGLISH_ARTISTS_AND_KEYWORDS.some((kw) => text.includes(kw));
    const hasNonEnglishScript =
      KOREAN_SCRIPT.test(text) ||
      JAPANESE_SCRIPT.test(text) ||
      CYRILLIC_SCRIPT.test(text) ||
      ARABIC_SCRIPT.test(text);

    if (isMainstreamEnglish && !hasNonEnglishScript) {
      return { isValid: false, confidence: 0, reason: "Pure English pop rejected from Sonic World" };
    }

    // Positive acceptance for K-Pop, J-Pop, Latin, Afrobeats, etc.
    if (hasNonEnglishScript) {
      return { isValid: true, confidence: 0.95, detectedLanguage: "international" };
    }

    const hasInternationalKeyword = INTERNATIONAL_KEYWORDS.some((kw) => text.includes(kw));
    if (hasInternationalKeyword) {
      return { isValid: true, confidence: 0.90, detectedLanguage: "international" };
    }

    // If Latin script without strong international markers, reject to prevent English leakage
    return { isValid: false, confidence: 0.2, reason: "Not confident track belongs to international non-English catalogue" };
  }

  // -------------------------------------------------------------------------
  // 5. Aura Phonk (Authentic Phonk Discovery)
  // -------------------------------------------------------------------------
  if (normSection === "boost-aura" || normSection === "aura-phonk" || normSection === "phonk") {
    // Reject generic rap/trap/EDM that lacks phonk markers
    const hasGeneric = NON_PHONK_GENERIC.some((g) => text.includes(g));
    const phonkMatches = PHONK_KEYWORDS.filter((kw) => text.includes(kw)).length;

    if (hasGeneric && phonkMatches === 0) {
      return { isValid: false, confidence: 0, reason: "Generic non-phonk genre rejected from Aura Phonk" };
    }

    // Must have at least one genuine phonk keyword or verified producer
    if (phonkMatches >= 1) {
      return { isValid: true, confidence: Math.min(0.98, 0.7 + phonkMatches * 0.15), detectedLanguage: "phonk" };
    }

    return { isValid: false, confidence: 0.1, reason: "Track lacks authentic Phonk signals" };
  }

  // Default / MEVO Pulse: universal acceptance if not rejected by music/shorts checks
  return { isValid: true, confidence: 0.8 };
}

// ---------------------------------------------------------------------------
// 2. Shorts & Short-Form Filtering
// ---------------------------------------------------------------------------
const SHORTS_INDICATORS = [
  /#shorts\b/i,
  /#short\b/i,
  /\bshorts\b/i,
  /\bshort video\b/i,
  /\btiktok\b/i,
  /\/shorts\//i,
  /\(shorts\)/i,
  /\[shorts\]/i,
  /\bytshorts\b/i,
  /\breels?\b/i,
];

/**
 * Detects whether a YouTube video is a Short or short-form clip.
 * Enforces duration boundaries: 60 seconds <= duration <= 480 seconds (8 min).
 */
export function isShortsVideo(
  title: string,
  description = "",
  durationSeconds = 0,
  url = ""
): boolean {
  // 1. Check title, description, and url for explicit Shorts markers
  for (const pattern of SHORTS_INDICATORS) {
    if (pattern.test(title) || pattern.test(description) || pattern.test(url)) {
      return true;
    }
  }

  // 2. Duration filter: standard music tracks are between 60s and 480s.
  // Note: if duration is explicitly known and less than 55s, it is almost certainly a Short.
  if (durationSeconds > 0 && durationSeconds < 55) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// 3. Playability & Embeddability Verification
// ---------------------------------------------------------------------------
export function isPlayableTrack(video: {
  id: string;
  duration?: number;
  isMadeForKids?: boolean;
  embeddable?: boolean;
}): boolean {
  if (!video.id || video.id.trim().length !== 11) {
    return false;
  }

  if (video.embeddable === false) {
    return false;
  }

  if (video.isMadeForKids) {
    return false;
  }

  // Duration must be valid music length when known
  if (typeof video.duration === "number" && video.duration > 0) {
    if (video.duration < 55 || video.duration > 480) {
      return false;
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// 4. Dynamic Freshness, Hype & Popularity Ranking Model
// ---------------------------------------------------------------------------
export interface TrackScoreComponents {
  dailyVelocity: number;
  hypeScore: number;
  popularityScore: number;
  freshnessBoost: number;
  officialBonus: number;
  affinityBonus: number;
  totalScore: number;
}

/**
 * Calculates the dynamic ranking score for a candidate YouTube song.
 *
 * Scoring Philosophy:
 * CURRENT HYPE + FRESHNESS + CURRENT POPULARITY + SECTION RELEVANCE + OFFICIAL CREDIBILITY
 * strongly outweighs
 * OLD HISTORICAL VIEWS + WEAK RELEVANCE.
 */
export function calculateDynamicTrackScore(
  track: {
    publishedAt?: string;
    viewCount?: number;
    title: string;
    artist: string;
    channelTitle?: string;
  },
  sectionConfidence = 0.8
): TrackScoreComponents {
  const now = Date.now();
  const pubTimestamp = track.publishedAt ? Date.parse(track.publishedAt) : 0;
  const daysSincePublished =
    pubTimestamp > 0 && !isNaN(pubTimestamp)
      ? Math.max(0.2, (now - pubTimestamp) / (1000 * 60 * 60 * 24))
      : 365; // default 1 year if missing

  const viewCount = Math.max(0, track.viewCount || 0);

  // 1. Current Velocity / Momentum (Views per day)
  const dailyVelocity = viewCount / daysSincePublished;
  const hypeScore = Math.log10(Math.max(1, dailyVelocity)) * 12;

  // 2. Baseline Popularity (Logarithmic to prevent multi-million view old tracks from dominating)
  const popularityScore = Math.log10(Math.max(1, viewCount)) * 4;

  // 3. Balanced Freshness Boost & Age Decay scaled by momentum
  let baseFreshness = 0;
  if (daysSincePublished <= 7) {
    baseFreshness = 40;
  } else if (daysSincePublished <= 30) {
    baseFreshness = 30;
  } else if (daysSincePublished <= 90) {
    baseFreshness = 20;
  } else if (daysSincePublished <= 180) {
    baseFreshness = 10;
  } else if (daysSincePublished <= 365) {
    baseFreshness = 5;
  } else if (daysSincePublished <= 730) {
    baseFreshness = 0;
  } else if (daysSincePublished <= 1460) {
    baseFreshness = -12;
  } else if (daysSincePublished <= 2555) {
    baseFreshness = -24;
  } else {
    baseFreshness = -38;
  }

  // A brand new song with negligible views (<100/day) should not receive an unearned massive boost
  const momentumScale = baseFreshness > 0 ? Math.min(1.0, Math.max(0.1, dailyVelocity / 50.0)) : 1.0;
  const freshnessBoost = baseFreshness * momentumScale;

  // 4. Official Channel & Release Credibility Bonus
  const channel = track.channelTitle || track.artist || "";
  const officialScore = getOfficialContentScore(channel, track.title);
  const officialBonus = officialScore >= 60 ? 15 : 0;

  // 5. Section Match Confidence Bonus
  const affinityBonus = sectionConfidence >= 0.8 ? 25 : sectionConfidence >= 0.5 ? 5 : -40;

  const totalScore = hypeScore + popularityScore + freshnessBoost + officialBonus + affinityBonus;

  return {
    dailyVelocity,
    hypeScore,
    popularityScore,
    freshnessBoost,
    officialBonus,
    affinityBonus,
    totalScore,
  };
}

/**
 * Filter, validate, and rank an array of candidate tracks for a given section.
 */
export function filterAndRankSectionTracks<T extends {
  id: string;
  title: string;
  artist?: string;
  channel?: string;
  channelTitle?: string;
  description?: string;
  duration?: number | string;
  publishedAt?: string;
  viewCount?: number;
  [key: string]: any;
}>(
  candidates: T[],
  sectionId: string
): T[] {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return [];
  }

  const isMevoPulse = sectionId === "mevo-pulse" || sectionId === "trending";

  // Step 1: Validate Section Eligibility, Shorts, and Playability
  const validCandidates: { track: T; score: number }[] = [];

  for (const item of candidates) {
    if (!item || !item.id) continue;

    const title = item.title || "";
    const artist = item.artist || item.channel || item.channelTitle || "";
    const desc = item.description || "";
    const durSec =
      typeof item.duration === "number"
        ? item.duration
        : typeof item.duration === "string" && item.duration.includes(":")
        ? item.duration.split(":").reduce((acc, time) => 60 * acc + +time, 0)
        : 0;

    // Shorts Filter
    if (isShortsVideo(title, desc, durSec)) {
      continue;
    }

    // Playability Filter (duration boundary when known)
    if (durSec > 0 && (durSec < 55 || durSec > 480)) {
      continue;
    }

    // Section Content & Language Validation (unless MEVO Pulse which accepts all top music)
    let confidence = 0.85;
    if (!isMevoPulse) {
      const validation = validateSectionEligibility(
        { title, artist, channelTitle: item.channelTitle || artist, description: desc },
        sectionId
      );

      if (!validation.isValid) {
        continue;
      }
      confidence = validation.confidence;
    }

    // Calculate Dynamic Ranking Score
    const { totalScore } = calculateDynamicTrackScore(
      {
        title,
        artist,
        channelTitle: item.channelTitle || artist,
        publishedAt: item.publishedAt,
        viewCount: item.viewCount,
      },
      confidence
    );

    validCandidates.push({ track: item, score: totalScore });
  }

  // Step 2: Sort strictly by Dynamic Score descending
  validCandidates.sort((a, b) => b.score - a.score);

  return validCandidates.map((c) => c.track);
}
