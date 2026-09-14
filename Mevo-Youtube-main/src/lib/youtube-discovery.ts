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

/**
 * Filter criteria for Bengali tracks to drop from homepage Pulse:
 * - Unicode check for Bengali script in title, artist, or description (/[\u0980-\u09FF]/)
 * - Language/Region tag check: Any track flagged as Bengali / BD regional trending
 */
export function isBengaliTrack(track: {
  title?: string;
  artist?: string;
  channelTitle?: string;
  description?: string;
  language?: string;
  section?: string;
  region?: string;
}): boolean {
  const t = track.title || "";
  const a = track.artist || track.channelTitle || "";
  const d = track.description || "";
  const text = `${t} ${a} ${d}`.toLowerCase();

  // 1. Unicode check for Bengali script ([\u0980-\u09FF]) in title, artist, or description
  if (BENGALI_SCRIPT.test(t) || BENGALI_SCRIPT.test(a) || BENGALI_SCRIPT.test(d)) {
    return true;
  }

  // 2. Language/Region tag check: Any track flagged as Bengali / BD regional trending
  if (track.language && (track.language.toLowerCase().includes("bengali") || track.language.toLowerCase().includes("bangla"))) {
    return true;
  }
  if (track.section === "bangla" || track.section === "bengal-echo") {
    return true;
  }
  if (track.region?.toUpperCase() === "BD") {
    return true;
  }

  // 3. Known Bangla labels, bands, artists, or keywords
  for (const kw of BANGLA_ARTISTS_AND_KEYWORDS) {
    if (text.includes(kw)) {
      return true;
    }
  }

  return false;
}

// 1. Devotional / Religious chants / Kirtan / Waz / Bhajan Blacklist (Bangla & English)
export const BENGAL_ECHO_DEVOTIONAL_BLACKLIST = [
  /(\banukul\b|\bchorar gaan\b|\bkirtan\b|\bbhajan\b|\bwaz\b|\bgazal\b|\bislamic\b|\bshobai sunben\b|\bshokol mayera\b|\bসকল মায়েরা\b|\bছড়ার গান\b|\bঅনুকূল\b)/i,
  /\b(?:thakur|anukul\s*thakur|radha\s*krishna|harinaam|naam\s*kirtan|baul\s*kirtan|padabali|shyamasangeet|shyama\s*sangeet|namaz|azaan|quran|mahfil|waz\s*mahfil)\b/i,
  /(?:অনুকূল\s*ঠাকুর|হরিনাম|কীর্তন|ভজন|ওয়াজ|মাহফিল|গজল|ইসলামিক|ছড়ার\s*গান)/u,
];

// 2. Low-tier DJ / Remix / Stage / Meme / Spam tracks Blacklist (Bangla & English)
export const BENGAL_ECHO_LOWTIER_BLACKLIST = [
  /(\bdula bhai\b|\bdulabhai\b|\bdj remix\b|\bbass boosted\b|\bdance mix\b|\bjames inspired\b|\bnew bangla song\b|\breleased song\b|\bনাচ\b|\bগানটা একবার শুনবেন\b)/i,
  /("?Bangla Sad Song"?|"?New Bangla Song"?|"?Released Song"?|"?DJ Remix"?|"?James Inspired"?|"?Onek Koster Gaan"?|"?Kobe Dekhbo"?|"?Official Audio Released"?|"?Basto Shohor"?)/i,
  /\b(?:bangla\s*sad\s*song|new\s*bangla\s*song|released\s*song|dj\s*remix|james\s*inspired|onek\s*koster\s*gaan|kobe\s*dekhbo|official\s*audio\s*released|basto\s*shohor)\b/i,
  /\b(?:stage\s*program|stage\s*dance|arkestra|orchestra|open\s*air\s*stage|jatra|palli\s*geeti\s*remix|dj\s*party\s*mix|bhojpuri\s*mix)\b/i,
  /(?:দুলোভাই|দুলাভাই|ডিজে\s*মিক্স|ড্যান্স\s*মিক্স|স্টেজ\s*প্রোগ্রাম|নাচের\s*গান|কষ্টের\s*গান|অনেক\s*কষ্টের\s*গান|কবে\s*দেখবো|ব্যস্ত\s*শহর|নতুন\s*বাংলা\s*গান)/u,
];

// 3. Suspicious Clickbait & Generic Filler Patterns
export const BENGAL_ECHO_CLICKBAIT_BLACKLIST = [
  /(?:একবার\s*শুনবেন|সকল\s*মায়েরা|কান্না\s*ধরে\s*রাখতে\s*পারবেন\s*না|চোখের\s*পানি\s*ধরে|হৃদয়\s*ছোঁয়া|ভাইরাল\s*গান|সবাই\s*শুনবেন|বুক\s*ফাটা\s*কান্না|মন\s*জুড়ানো)/u,
  /\b(?:shobai sunben|shokol mayera|kanna dhore|chokher pani|hridoy chowa|viral gaan|buk fata)\b/i,
  /\b(?:new\s*song\s*(?:202[4-9]|203[0-9])|best\s*hit|best\s*hits|nonstop|non-stop|audio\s*jukebox|all\s*time\s*hit|full\s*audio\s*album)\b/i,
];

// 4. High-Standard Verified Bengali Studio Artists & Record Labels
export const BENGAL_ECHO_VERIFIED_ENTITIES = [
  "odd signature", "meghdol", "hatirpool sessions", "coke studio bangla",
  "coke studio", "wind of change", "bengal parampara", "bengal classical",
  "shunno", "shironamhin", "warfaze", "artcell", "lagnajita", "anupam roy",
  "svf music", "svf", "g-series", "g series", "laser vision", "soundtek",
  "sangeeta", "anupam recording", "anupam", "dhruba music station", "dhruba",
  "eagle music", "cmv", "zeemusicbangla", "zee music bangla", "saregama bengali",
  "times music bangla", "archetype", "aurthohin", "nemesis", "arbovirus",
  "chirkutt", "avoidrafa", "habib wahid", "tahsan", "minar rahman", "minar",
  "arijit singh", "somlata", "pritam hasan", "pritom hasan", "tashfee",
  "arnob", "papon", "konal", "level five", "karnival", "conclusion",
  "james", "nagar baul", "miles", "ayub bachchu", "lrb", "fossils",
  "cactus", "bappa mazumder", "imran mahmudul", "riddhi band", "enroute", "vibe",
  "chandrabindoo", "bhoomi", "mohiner ghoraguli", "sahana bajpaie", "rupam islam",
  "somlata acharyya", "shayan chowdhury arnob", "muza",
];

/**
 * Strict Bengal Echo Quality & Source Sanitization.
 * Enforces aggressive sanitization:
 * 1. Instant rejection of devotional/religious chants, kirtan, waz, bhajan, anukul thakur, chorar gaan.
 * 2. Instant rejection of low-tier DJ remixes, dula bhai, dance mix, meme tracks, amateur stage shows.
 * 3. Instant rejection of clickbait titles (e.g., "একবার শুনবেন", "সকল মায়েরা", "কান্না ধরে রাখতে পারবেন না").
 * 4. Strictly drops unofficial third-party compilation channels or amateur uploaders.
 * 5. Strictly excludes padded portrait/shorts videos (<90s, height > width) and low-res thumbnails (<320x180).
 */
export function validateBengalEchoTrack(track: {
  title: string;
  artist?: string;
  channelTitle?: string;
  description?: string;
  duration?: number;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
}): { isValid: boolean; reason?: string } {
  const t = (track.title || "").trim();
  const a = (track.artist || "").trim();
  const c = (track.channelTitle || "").trim();
  const d = (track.description || "").trim();
  const text = `${t} ${a} ${c} ${d}`.toLowerCase();
  const aLower = `${a} ${c}`.toLowerCase();
  const dur = typeof track.duration === "number" ? track.duration : 0;

  // 1. Duration check: duration < 90s strictly excluded (eliminate Shorts/clips)
  if (dur > 0 && dur < 90) {
    return { isValid: false, reason: "Duration < 90s (Shorts/clip rejected)" };
  }
  // Exclude overly long compilations / full albums / continuous mix > 10m (600s)
  if (dur > 600) {
    return { isValid: false, reason: "Duration > 10m (Long mix/compilation rejected)" };
  }

  // 2. Portrait thumbnail check: height > width rejected (eliminate vertical shorts)
  if (
    typeof track.thumbnailWidth === "number" &&
    typeof track.thumbnailHeight === "number" &&
    track.thumbnailWidth > 0 &&
    track.thumbnailHeight > track.thumbnailWidth
  ) {
    return { isValid: false, reason: "Portrait/vertical thumbnail rejected" };
  }

  // 3. Low resolution thumbnail check: drop low-res/amateur thumbnails (<320x180)
  if (
    typeof track.thumbnailWidth === "number" &&
    typeof track.thumbnailHeight === "number" &&
    track.thumbnailWidth > 0 &&
    (track.thumbnailWidth < 320 || track.thumbnailHeight < 180)
  ) {
    return { isValid: false, reason: "Low resolution thumbnail rejected" };
  }

  // 4. Devotional / Religious Blacklist Check (Bangla & English)
  // Check title, artist, channelTitle, and combined text
  for (const pattern of BENGAL_ECHO_DEVOTIONAL_BLACKLIST) {
    if (pattern.test(t) || pattern.test(a) || pattern.test(c) || pattern.test(text)) {
      return { isValid: false, reason: "Devotional / religious chant / kirtan / waz / bhajan rejected" };
    }
  }

  // 5. Low-tier DJ / Remix / Stage / Meme Blacklist Check (Bangla & English)
  // Check title, artist, channelTitle, and combined text
  for (const pattern of BENGAL_ECHO_LOWTIER_BLACKLIST) {
    if (pattern.test(t) || pattern.test(a) || pattern.test(c) || pattern.test(text)) {
      return { isValid: false, reason: "Low-tier DJ / remix / stage / meme / low-effort track rejected" };
    }
  }

  // 6. Suspicious Clickbait Pattern Check
  for (const pattern of BENGAL_ECHO_CLICKBAIT_BLACKLIST) {
    if (pattern.test(t) || pattern.test(d) || pattern.test(text)) {
      return { isValid: false, reason: "Clickbait spam phrase rejected" };
    }
  }

  // 7. Base catalog quality filter
  const catCheck = isAcceptableCatalogTrack(t, a || c, d, dur, { width: track.thumbnailWidth, height: track.thumbnailHeight });
  if (!catCheck.acceptable) {
    return { isValid: false, reason: catCheck.reason };
  }

  // 8. High-Standard Channel/Source Filtering:
  // Ensure "Bengal Echo" ONLY curates legitimate, verified, or known standard studio artists/labels:
  // - YouTube Music Topic channel (- Topic)
  // - Verified official record label / studio band / artist
  // - Explicit official studio release markers ("official music video", "official audio", "official lyrical video")
  const isTopic = aLower.includes("- topic") || aLower.endsWith("topic");
  const isVerifiedEntity = BENGAL_ECHO_VERIFIED_ENTITIES.some(
    (entity) => aLower.includes(entity) || t.toLowerCase().includes(entity)
  );
  const hasStudioMarker =
    t.toLowerCase().includes("official music video") ||
    t.toLowerCase().includes("official audio") ||
    t.toLowerCase().includes("official lyrical") ||
    t.toLowerCase().includes("coke studio") ||
    t.toLowerCase().includes("hatirpool sessions") ||
    t.toLowerCase().includes("studio version") ||
    t.toLowerCase().includes("wind of change") ||
    t.toLowerCase().includes("bengal parampara");

  // Drop tracks from unofficial third-party compilation channels or amateur uploader channels
  const isAmateurChannel =
    /\b(?:dj\s*remix|status|tiktok|creation|edits|lover|bhojpuri|arkestra|compilation|mashup|jukebox)\b/i.test(aLower);

  if (isAmateurChannel) {
    return { isValid: false, reason: "Unofficial compilation or amateur uploader channel rejected" };
  }

  if (!isTopic && !isVerifiedEntity && !hasStudioMarker) {
    return { isValid: false, reason: "Dropped from unofficial third-party or amateur uploader channel" };
  }

  return { isValid: true };
}

/**
 * Bengali Quality Filters for "See All" expanded view.
 */
export function isCuratedStudioBengaliTrack(track: {
  title: string;
  artist?: string;
  channelTitle?: string;
  description?: string;
  duration?: number;
  viewCount?: number;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
}): boolean {
  if (!isBengaliTrack(track)) {
    return false;
  }
  return validateBengalEchoTrack(track).isValid;
}

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

// English Essence Spam & Low-effort Blacklist
export const ENGLISH_ESSENCE_SPAM_BLACKLIST = [
  /(\bbest pop\b|\belectric love\b|\bmidnight fire\b|\bneonwave\b|\bcompilation\b|\bnonstop\b|\bmashup\b|\bbest original\b|\btop hits \d{4}\b|\bnew emotional\b|\broyalty free\b|\bno copyright\b)/i,
  /\b(?:ncs release|copyright free|ai pop|suno|udio|text heavy|stream safe|lofi study mix|gaming music mix)\b/i,
];

// Curated High-Standard Platforms for English Essence
export const ENGLISH_ESSENCE_VERIFIED_PLATFORMS = [
  "colors show", "a colors show", "tiny desk concert", "tiny desk",
  "bbc radio 1 live lounge", "live lounge", "majestic casual",
];

// Verified English Artists, Labels & Platforms
export const ENGLISH_ESSENCE_VERIFIED_ENTITIES = [
  "the weeknd", "billie eilish", "dua lipa", "coldplay", "post malone",
  "taylor swift", "harry styles", "bruno mars", "silk sonic", "anderson .paak",
  "ed sheeran", "ariana grande", "justin bieber", "eminem", "rihanna",
  "imagine dragons", "maroon 5", "charlie puth", "olivia rodrigo", "sam smith",
  "selena gomez", "katy perry", "shawn mendes", "adele", "beyonce", "lady gaga",
  "travis scott", "kanye", "kendrick lamar", "twenty one pilots", "the chainsmokers",
  "marshmello", "alan walker", "kygo", "david guetta", "calvin harris",
  "sabrina carpenter", "sza", "chappell roan", "tate mcrae", "benson boone",
  "teddy swims", "halsey", "miley cyrus", "sabrina", "lorde", "lana del rey",
  "daniel caesar", "giveon", "h.e.r.", "leon bridges", "steve lacy", "frank ocean",
  "republic records", "interscope", "atlantic records", "columbia records",
  "rca records", "def jam", "vevo", "warner records", "sony music",
  "colors show", "tiny desk", "live lounge", "majestic casual",
];

/**
 * Strict English Essence Quality & Source Sanitization.
 * 1. Instantly drops low-effort/spam phrases ("Best Pop", "Electric Love", "Midnight Fire", "Neonwave", "Top Hits 2024", etc.).
 * 2. Excludes unofficial fan-made lyric videos with AI/clipart graphics unless from verified channels.
 * 3. Enforces Official Artist Channels (Topic, VEVO), recognized studio labels, or curated platforms (COLORS SHOW, Tiny Desk, Live Lounge, Majestic Casual).
 * 4. Excludes padded portrait/shorts videos (<90s, height > width) and low-res thumbnails (<320x180).
 */
export function validateEnglishEssenceTrack(track: {
  title: string;
  artist?: string;
  channelTitle?: string;
  description?: string;
  duration?: number;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
}): { isValid: boolean; reason?: string } {
  const t = (track.title || "").trim();
  const a = (track.artist || "").trim();
  const c = (track.channelTitle || "").trim();
  const d = (track.description || "").trim();
  const text = `${t} ${a} ${c} ${d}`.toLowerCase();
  const aLower = `${a} ${c}`.toLowerCase();
  const dur = typeof track.duration === "number" ? track.duration : 0;

  // 1. Duration check: duration < 90s strictly excluded (eliminate Shorts/clips)
  if (dur > 0 && dur < 90) {
    return { isValid: false, reason: "Duration < 90s (Shorts/clip rejected)" };
  }
  // Exclude overly long compilations / mix > 10m (600s)
  if (dur > 600) {
    return { isValid: false, reason: "Duration > 10m (Compilation/mix rejected)" };
  }

  // 2. Portrait thumbnail check: height > width rejected (eliminate vertical shorts)
  if (
    typeof track.thumbnailWidth === "number" &&
    typeof track.thumbnailHeight === "number" &&
    track.thumbnailWidth > 0 &&
    track.thumbnailHeight > track.thumbnailWidth
  ) {
    return { isValid: false, reason: "Portrait/vertical thumbnail rejected" };
  }

  // 3. Low resolution thumbnail check: drop low-res/amateur thumbnails (<320x180)
  if (
    typeof track.thumbnailWidth === "number" &&
    typeof track.thumbnailHeight === "number" &&
    track.thumbnailWidth > 0 &&
    (track.thumbnailWidth < 320 || track.thumbnailHeight < 180)
  ) {
    return { isValid: false, reason: "Low resolution thumbnail rejected" };
  }

  // 4. Non-Latin script immediate rejection
  if (
    BENGALI_SCRIPT.test(text) ||
    DEVANAGARI_SCRIPT.test(text) ||
    ARABIC_SCRIPT.test(text) ||
    KOREAN_SCRIPT.test(text) ||
    JAPANESE_SCRIPT.test(text) ||
    CYRILLIC_SCRIPT.test(text)
  ) {
    return { isValid: false, reason: "Non-Latin script detected in English Essence" };
  }

  // 5. Reject South Asian artists
  if (BANGLA_ARTISTS_AND_KEYWORDS.some((kw) => text.includes(kw)) || HINDI_ARTISTS_AND_KEYWORDS.some((kw) => text.includes(kw))) {
    return { isValid: false, reason: "South Asian artist detected in English Essence" };
  }

  // 6. Strict Blacklist & Spam Reject Filter
  for (const pattern of ENGLISH_ESSENCE_SPAM_BLACKLIST) {
    if (pattern.test(t) || pattern.test(a) || pattern.test(c) || pattern.test(text)) {
      return { isValid: false, reason: "English Essence spam/low-effort keyword rejected" };
    }
  }

  // 7. Base catalog quality filter
  const catCheck = isAcceptableCatalogTrack(t, a || c, d, dur, { width: track.thumbnailWidth, height: track.thumbnailHeight });
  if (!catCheck.acceptable) {
    return { isValid: false, reason: catCheck.reason };
  }

  // 8. Verified Source Prioritization:
  // - Official Artist Channels (OACs ending with - Topic or VEVO)
  // - Curated Platforms (COLORS SHOW, Tiny Desk, BBC Radio 1 Live Lounge, Majestic Casual)
  // - Recognized studio labels and verified artists
  // - Official studio release markers ("official music video", "official audio", "official video", "visualizer", "live lounge")
  const isTopic = aLower.includes("- topic") || aLower.endsWith("topic");
  const isVevo = aLower.includes("vevo") || t.toLowerCase().includes("vevo");
  const isCuratedPlatform = ENGLISH_ESSENCE_VERIFIED_PLATFORMS.some((platform) => aLower.includes(platform) || t.toLowerCase().includes(platform));
  const isVerifiedEntity = ENGLISH_ESSENCE_VERIFIED_ENTITIES.some((entity) => aLower.includes(entity) || t.toLowerCase().includes(entity));
  const hasStudioMarker =
    t.toLowerCase().includes("official music video") ||
    t.toLowerCase().includes("official audio") ||
    t.toLowerCase().includes("official video") ||
    t.toLowerCase().includes("official lyric video") ||
    t.toLowerCase().includes("official visualizer") ||
    t.toLowerCase().includes("tiny desk") ||
    t.toLowerCase().includes("colors show") ||
    t.toLowerCase().includes("live lounge");

  // Exclude unofficial fan-made lyric videos with AI/clipart graphics unless from verified channels
  const isLyricVideo = /\b(?:lyrics? video|lyrics?)\b/i.test(t);
  if (isLyricVideo && !isTopic && !isVevo && !isVerifiedEntity && !t.toLowerCase().includes("official lyric")) {
    return { isValid: false, reason: "Unofficial fan-made lyric video rejected" };
  }

  // Drop tracks from unofficial amateur compilation channels
  const isAmateurChannel =
    /\b(?:dj\s*remix|status|tiktok|creation|edits|lover|bhojpuri|arkestra|compilation|mashup|jukebox|nightcore|sped up|slowed down)\b/i.test(aLower);
  if (isAmateurChannel) {
    return { isValid: false, reason: "Unofficial compilation or amateur uploader channel rejected" };
  }

  if (!isTopic && !isVevo && !isCuratedPlatform && !isVerifiedEntity && !hasStudioMarker) {
    return { isValid: false, reason: "Dropped from unofficial third-party or amateur uploader channel" };
  }

  return { isValid: true };
}

/**
 * Strict Sonic World Quality & Source Sanitization.
 * Curates premium global multi-language music (Latin, K-Pop, French, Japanese, Middle Eastern):
 * 1. Strict exclusion of Bangla (Unicode \u0980-\u09FF & keywords) and Hindi/Bollywood (Unicode \u0900-\u097F & keywords).
 * 2. Strict exclusion of pure mainstream English pop unless matching international artists/collaborations.
 * 3. Strict duration bounds (90s - 600s) eliminating shorts and extended mixes.
 * 4. Strict thumbnail check: drops portrait/shorts (height > width) and low-res thumbnails (<320x180).
 * 5. Rejects low-quality spam, generic mixes, and compilations.
 * 6. Enforces certified global seeds (Latin/Spanish, K-Pop/K-Indie, French, Japanese/City Pop, Arabic/Global Beats)
 *    and international scripts (Hangul, Kanji/Kana, Arabic, Cyrillic).
 */
export function validateSonicWorldTrack(track: {
  title: string;
  artist?: string;
  channelTitle?: string;
  description?: string;
  duration?: number;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
}): { isValid: boolean; reason?: string } {
  const t = (track.title || "").trim();
  const a = (track.artist || "").trim();
  const c = (track.channelTitle || "").trim();
  const d = (track.description || "").trim();
  const text = `${t} ${a} ${c} ${d}`.toLowerCase();
  const dur = typeof track.duration === "number" ? track.duration : 0;

  // 1. Duration check: duration < 90s strictly excluded (eliminate Shorts/clips)
  if (dur > 0 && dur < 90) {
    return { isValid: false, reason: "Duration < 90s (Shorts/clip rejected)" };
  }
  if (dur > 600) {
    return { isValid: false, reason: "Duration > 10m (Compilation/long mix rejected)" };
  }

  // 2. Portrait thumbnail check: height > width rejected (eliminate vertical shorts)
  if (
    typeof track.thumbnailWidth === "number" &&
    typeof track.thumbnailHeight === "number" &&
    track.thumbnailWidth > 0 &&
    track.thumbnailHeight > track.thumbnailWidth
  ) {
    return { isValid: false, reason: "Portrait/vertical thumbnail rejected" };
  }

  // 3. Low resolution thumbnail check: drop low-res/amateur thumbnails (<320x180)
  if (
    typeof track.thumbnailWidth === "number" &&
    typeof track.thumbnailHeight === "number" &&
    track.thumbnailWidth > 0 &&
    (track.thumbnailWidth < 320 || track.thumbnailHeight < 180)
  ) {
    return { isValid: false, reason: "Low resolution thumbnail rejected" };
  }

  // 4. Strict Block on Bangla (Unicode range & keywords)
  if (/[\u0980-\u09FF]/.test(text) || BANGLA_ARTISTS_AND_KEYWORDS.some((kw) => text.includes(kw))) {
    return { isValid: false, reason: "Bangla track rejected from Sonic World" };
  }

  // 5. Strict Block on Hindi / Bollywood (Unicode range & keywords)
  const isHindi =
    /[\u0900-\u097F]/.test(text) ||
    HINDI_ARTISTS_AND_KEYWORDS.some((kw) => {
      if (kw === "king" && text.includes("king gnu")) return false;
      if (kw.length <= 4) return new RegExp(`\\b${kw}\\b`, "i").test(text);
      return text.includes(kw);
    });
  if (isHindi) {
    return { isValid: false, reason: "Hindi/Bollywood track rejected from Sonic World" };
  }

  // 6. Generic Low-Quality Spam, Clickbait & Compilations
  if (
    /\b(?:best pop|compilation|nonstop|mashup|top hits \d{4}|royalty free|no copyright|gaming music|bass boosted test|status video|tiktok remix|sped up|slowed down|ai music|ai song|ai cover|ai pop|suno|udio)\b/i.test(
      text
    )
  ) {
    return { isValid: false, reason: "Generic spam/compilation/remix rejected" };
  }

  // 7. Strict Block on pure mainstream English pop
  const isMainstreamEnglish = ENGLISH_ARTISTS_AND_KEYWORDS.some((kw) => text.includes(kw));
  const hasNonEnglishScript =
    /[\uAC00-\uD7AF\u3040-\u30FF\u4E00-\u9FAF]/.test(text) ||
    /[\u0600-\u06FF]/.test(text) ||
    /[\u0400-\u04FF]/.test(text);

  if (isMainstreamEnglish && !hasNonEnglishScript) {
    return { isValid: false, reason: "Pure English pop rejected from Sonic World" };
  }

  // 8. International Script or International Keywords / Artists verification
  if (hasNonEnglishScript) {
    return { isValid: true };
  }

  const hasInternationalMarker = INTERNATIONAL_KEYWORDS.some((kw) => text.includes(kw));
  if (hasInternationalMarker) {
    return { isValid: true };
  }

  return { isValid: false, reason: "Track lacks authentic international/world signals" };
}

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
export const INTERNATIONAL_KEYWORDS = [
  // Latin / Spanish
  "rosalía", "rosalia", "bad bunny", "kali uchis", "rauw alejandro",
  "latin", "reggaeton", "reggaetón", "karol g", "peso pluma", "j balvin",
  "maluma", "feid", "ozuna", "daddy yankee", "anuel", "shakira", "luis fonsi",
  "becky g", "farruko", "myke towers", "bizarrap", "tiago pzk", "duki",
  "manuel turizo", "quevedo", "sebastian yatra", "camilo", "latin pop", "urbano", "bachata",
  // K-Pop / K-Indie / K-R&B
  "newjeans", "dean", "iu", "bibi", "le sserafim", "kpop", "k-pop", "k-indie", "k-r&b",
  "bts", "blackpink", "stray kids", "twice", "seventeen", "enhypen", "txt", "aespa",
  "ive", "itzy", "illit", "babymonster", "riize", "zerobaseone", "kiss of life",
  "nct", "exo", "red velvet", "g-idle", "gidle", "ateez", "the boyz", "monsta x",
  "taeyeon", "jungkook", "jimin",
  // French / European Indie / Chanson
  "stromae", "indila", "videoclub", "angèle", "angele", "french pop", "chanson",
  "aya nakamura", "gims", "kendji", "pomme", "clara luciani", "zaz", "orelsan",
  // Japanese / City Pop / J-Indie
  "fujii kaze", "yoasobi", "king gnu", "lamp", "city pop", "jpop", "j-pop",
  "j-indie", "kenshi yonezu", "aimyon", "higedan", "vaundy", "creepy nuts",
  "mrs. green apple", "ado", "lisa", "radwimps", "anime ost", "vocaloid",
  // Middle Eastern / Arabic / Global Beats
  "elyanna", "cairokee", "arabic", "middle eastern", "nancy ajram", "amr diab", "elissa",
  // Afrobeats / World Grooves
  "afrobeats", "afrobeat", "amapiano", "burna boy", "rema", "ayra starr", "wizkid",
  "asake", "tems", "davido", "omah lay", "ckay", "fireboy", "tyla", "afropop",
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
    duration?: number;
    thumbnailWidth?: number;
    thumbnailHeight?: number;
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

    // Strict Bengal Echo Sanitization: reject devotional, kirtan, waz, low-tier DJ/remix/meme, clickbait, and amateur uploads
    const echoValidation = validateBengalEchoTrack(track);
    if (!echoValidation.isValid) {
      return { isValid: false, confidence: 0, reason: echoValidation.reason };
    }

    // Acceptance if Bengali Unicode script is present (after passing aggressive sanitization)
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
    // Strict English Essence Quality & Source Sanitization
    const englishValidation = validateEnglishEssenceTrack(track);
    if (!englishValidation.isValid) {
      return { isValid: false, confidence: 0, reason: englishValidation.reason };
    }

    return { isValid: true, confidence: 0.95, detectedLanguage: "english" };
  }

  // -------------------------------------------------------------------------
  // 4. Sonic World (International non-Bangla, non-Hindi, non-English)
  // -------------------------------------------------------------------------
  if (normSection === "sonic-world" || normSection === "global") {
    const sonicValidation = validateSonicWorldTrack(track);
    if (!sonicValidation.isValid) {
      return { isValid: false, confidence: 0, reason: sonicValidation.reason };
    }
    return { isValid: true, confidence: 0.95, detectedLanguage: "international" };
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
  /#ytshorts\b/i,
  /\bshorts\b/i,
  /\bshort video\b/i,
  /\bshort clip\b/i,
  /\btiktok\b/i,
  /\/shorts\//i,
  /\(shorts\)/i,
  /\[shorts\]/i,
  /\bytshorts\b/i,
  /\breels?\b/i,
  /\bshorts feed\b/i,
  /\bstatus shorts\b/i,
];

/**
 * Strict Shorts and short-form video detector.
 * Filters out any video/track with duration < 90 seconds (to automatically eliminate YouTube Shorts and TikTok audio clips)
 * and excludes any item that has /shorts/ in its URL or metadata tags indicating a vertical short.
 */
export function isShortsVideo(
  title: string,
  description = "",
  durationSeconds = 0,
  url = ""
): boolean {
  const t = (title || "").toLowerCase();
  const d = (description || "").toLowerCase();
  const u = (url || "").toLowerCase();

  // 1. URL / ID Check: Exclude any item that has /shorts/ in its URL or metadata
  if (u.includes("/shorts/") || t.includes("/shorts/") || d.includes("/shorts/")) {
    return true;
  }

  // 2. Metadata tags indicating a vertical short / reels / tiktok
  for (const pattern of SHORTS_INDICATORS) {
    if (pattern.test(t) || pattern.test(d) || pattern.test(u)) {
      return true;
    }
  }

  // 3. Duration Check: Filter out any video/track with duration < 90 seconds
  // (automatically eliminates YouTube Shorts and TikTok audio clips)
  if (durationSeconds > 0 && durationSeconds < 90) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// 2b. Hard Quality & Content Type Filters
// ---------------------------------------------------------------------------

// Banned non-music video formats (interviews, reactions, podcasts, gameplay, tutorials, movie scenes)
const BANNED_NON_MUSIC_PATTERNS = [
  /\breaction(?:\s*video)?\b/i,
  /\breacts?\s*to\b/i,
  /\breview\b/i,
  /\bpodcast\b/i,
  /\binterview\b/i,
  /\bbehind\s*the\s*scenes\b/i,
  /\bmaking\s*of\b/i,
  /\btrailer\b/i,
  /\bteaser\b/i,
  /\btutorial\b/i,
  /\bgameplay\b/i,
  /\bgaming\b/i,
  /\bwalkthrough\b/i,
  /\bunboxing\b/i,
  /\bmovie\s*scene\b/i,
  /\bmovie\s*clip\b/i,
  /\bfilm\s*scene\b/i,
  /\bpress\s*conference\b/i,
  /\bhighlights\b/i,
  /\bshort\s*film\b/i,
];

// Banned compilation, full album, jukebox, and long mix patterns
const BANNED_COMPILATION_PATTERNS = [
  /\bfull\s*(?:album|audio\s*jukebox|jukebox)\b/i,
  /\b(?:[1-9]|1[0-9]|2[0-4])\s*hours?\s*(?:mix|loop|version|audio|music)?\b/i,
  /\b(?:[1-9]|1[0-9]|2[0-4])\s*hr\b/i,
  /\bnon\s*stop\b/i,
  /\bnonstop\b/i,
  /\ball\s*songs\b/i,
  /\bgreatest\s*hits\b/i,
  /\bbest\s*songs\s*of\b/i,
  /\bmegamix\b/i,
  /\bmedley\b/i,
  /\bcompilation\b/i,
  /\bcountdown\b/i,
  /\btop\s*\d{1,3}\s*(?:songs?|phonk|hits|tracks|music)?\b/i,
  /\bbillboard\s*hot\s*\d{1,3}\b/i,
  /\b\d{1,2}\s+(?:most\s+)?(?:viral|best|popular|top|trending)\b/i,
  /\bmost\s+streamed\s+songs?\b/i,
  /\bof\s+all\s+time\b/i,
  /\bby\s+each\s+month\b/i,
  /\b(?:top|best)\s+hits\s*(?:20\d\d)?\b/i,
  /\bmusic\s*20\d\d\b/i,
  /\bplaylist\s+on\s+spotify\b/i,
  /\bspotify\s+playlist\b/i,
  /\bpop\s*music\s*playlist\b/i,
  /\b(?:spotify|billboard)\s+hits\b/i,
  /\b(?:top\s*\d+|best)\s*(?:pop|hits|songs)\s*spotify\b/i,
  /\b24\/7\s*live\b/i,
  /\blive\s*stream\b/i,
  /\bchosen\s+by\s+listeners\b/i,
  /\bboost\s+your\s+aura\b/i,
  /\bavee_player\b/i,
];

// Banned ambient, sleep, study, rain, and meditation audio
const BANNED_AMBIENT_PATTERNS = [
  /\b(?:deep\s*sleep|sleep\s*music|study\s*music|relaxation\s*music|rain\s*sounds?|white\s*noise|meditation\s*music|binaural\s*beats|healing\s*frequency|asmr)\b/i,
];

// Banned devotional and religious audio from mainstream music catalog
const BANNED_DEVOTIONAL_PATTERNS = [
  /\b(?:bhajan|kirtan|aarti|chalisa|mantra|qawwali|waz|mahfil|nasheed|radha\s*krishna)\b/i,
];

// Banned amateur, karaoke, and fan formats
const BANNED_AMATEUR_PATTERNS = [
  /\bkaraoke(?:\s*version|\s*track)?\b/i,
  /\binstrumental(?:\s*version|\s*cover)?\b/i,
  /\bbacking\s*track\b/i,
  /\bfan\s*made\b/i,
  /\bfan\s*edit\b/i,
  /\bai\s*cover\b/i,
  /\bamateur\s*cover\b/i,
  /\bvocal\s*cut\b/i,
];

// Banned WhatsApp / Status / Clickbait spam patterns
const BANNED_STATUS_SPAM_PATTERNS = [
  /\bwhatsapp\s*status\b/i,
  /\bstatus\s*(?:video|song)\b/i,
  /\blyrics?\s*status\b/i,
  /\bfullscreen\s*status\b/i,
  /\b4k\s*fullscreen\b/i,
  /\bstatus\s*clip\b/i,
  /\bstatus\s*edit\b/i,
];

// Generic spam title patterns (e.g. "New Song 2026", "New Hindi Song", "Bollywood Romantic Song 2026")
const GENERIC_SPAM_TITLE_PATTERNS = [
  /\bnew\s+(?:hindi|bangla|punjabi|english|bhojpuri|tamil|telugu|bollywood|romantic|sad)\s*songs?\b/i,
  /\bhit\s*songs?\s*(?:202[0-9])\b/i,
  /\b(?:bollywood\s+)?romantic\s+songs?\s*(?:202[0-9])\b/i,
  /\bnew\s+song\s+202[0-9]\b/i,
  /\b(?:dj|remix)\s*(?:new|latest|top|viral|trending)\s*songs?\b/i,
];

// Verified Record Labels & Major Music Brands
export const MAJOR_MUSIC_LABELS = [
  "t-series", "sony music", "zee music", "yrf", "saregama", "tips official",
  "speed records", "universal music", "warner music", "svf", "g-series",
  "anupam", "eagle music", "dhruba", "columbia records", "atlantic records",
  "republic records", "interscope", "def jam", "rca records", "big hit",
  "hybe", "smtown", "jyp", "yg entertainment", "vevo",
];

// Known low-quality / listicle / compilation channels
const BANNED_CHANNELS = [
  "top music hits",
  "billboard",
  "chart data",
  "redlist",
  "chill pop sunset",
  "pop music",
  "trending songs",
  "dynamic deep house",
  "hits we love",
  "bitmuzic",
  "aaronthehiphopguy",
  "shubhadip dey",
  "prakash jojawar",
  "simpal kharel",
];

// Strict Title & Keyword Blacklist Patterns (case-insensitive check)
// Rejects generic mix, compilation, clickbait, spam words, and shorts/tiktok tags
export const STRICT_TITLE_BLACKLIST_PATTERNS = [
  /\bbest\b/i,
  /\bbest\s*pop\b/i,
  /\bbest\s*songs?\b/i,
  /\belectric\s*love\b/i,
  /\bcompilations?\b/i,
  /\btop\s*hits?\b/i,
  /\bnon\s*stop\b/i,
  /\bnonstop\b/i,
  /\bmashups?\b/i,
  /#shorts\b/i,
  /\bshorts\b/i,
  /\btiktok\b/i,
];

/**
 * Hard quality catalog filter.
 * Rejects non-music videos, compilations, sleep tracks, karaoke, status spam, generic spam titles,
 * vertical shorts (< 90s), and portrait/vertical thumbnails.
 */
export function isAcceptableCatalogTrack(
  title: string,
  channel: string,
  description = "",
  durationSeconds = 0,
  thumbnailMetadata?: { width?: number; height?: number; url?: string } | string
): { acceptable: boolean; reason?: string } {
  const t = (title || "").toLowerCase().trim();
  const c = (channel || "").toLowerCase().trim();
  const d = (description || "").toLowerCase().trim();

  // 1. Title & Keyword Blacklist Filter (case-insensitive check)
  // Rejects: "best", "best pop", "best songs", "electric love", "compilation", "top hits", "nonstop", "mashup", "#shorts", "shorts", "tiktok"
  for (const pattern of STRICT_TITLE_BLACKLIST_PATTERNS) {
    if (pattern.test(t)) {
      return { acceptable: false, reason: `Title matched blacklisted keyword/tag: ${pattern}` };
    }
  }

  // 2. Video Format & Shorts Exclusion:
  // Duration Check: Filter out any video/track with duration < 90 seconds (Shorts/TikTok audio clips)
  // Maximum 480s (8 minutes) to eliminate full albums and multi-hour mixes
  if (durationSeconds > 0 && durationSeconds < 90) {
    return { acceptable: false, reason: "Duration < 90s (Shorts/TikTok audio clip elimination)" };
  }
  if (durationSeconds > 480) {
    return { acceptable: false, reason: "Duration exceeds 8 minutes" };
  }

  // 3. Thumbnail / Portrait Cover Safeguard:
  // Reject if metadata specifies thumbnail aspect ratio or dimensions with height > width (portrait/vertical screen)
  if (thumbnailMetadata && typeof thumbnailMetadata === "object") {
    const { width, height } = thumbnailMetadata;
    if (typeof width === "number" && typeof height === "number" && width > 0 && height > 0) {
      if (height > width) {
        return { acceptable: false, reason: `Portrait/vertical thumbnail rejected (${width}x${height})` };
      }
    }
  }

  // 4. Banned low-quality channels
  for (const banned of BANNED_CHANNELS) {
    if (c.includes(banned)) {
      return { acceptable: false, reason: `Banned low-quality channel: ${banned}` };
    }
  }

  // 5. Multi-artist compilation lists in title (e.g. "Adele, Rihanna, Selena Gomez... - Billboard Hot 100")
  // Legitimate Bollywood songs from verified labels often list actors/singers, so exempt official channels
  const isOfficialRelease =
    c.endsWith("- topic") ||
    c.includes("- topic") ||
    c.includes("vevo") ||
    c.includes("official") ||
    MAJOR_MUSIC_LABELS.some((lbl) => c.includes(lbl));

  if (!isOfficialRelease) {
    const commaCount = (t.match(/,/g) || []).length;
    if (commaCount >= 4 || (commaCount >= 3 && (t.includes("billboard") || t.includes("spotify") || t.includes("hits") || t.includes("top")))) {
      return { acceptable: false, reason: "Multi-artist compilation / mashup list" };
    }
  }

  // 1. Generic spam titles without identity
  for (const pattern of GENERIC_SPAM_TITLE_PATTERNS) {
    if (pattern.test(t)) {
      return { acceptable: false, reason: "Generic spam title without artist identity" };
    }
  }

  // 2. Status / WhatsApp video spam
  for (const pattern of BANNED_STATUS_SPAM_PATTERNS) {
    if (pattern.test(t) || pattern.test(d)) {
      return { acceptable: false, reason: "Status / WhatsApp short clip" };
    }
  }

  // 3. Non-music formats (reaction, podcast, interview, gameplay, scenes)
  for (const pattern of BANNED_NON_MUSIC_PATTERNS) {
    if (pattern.test(t) || pattern.test(c)) {
      return { acceptable: false, reason: "Non-music video type" };
    }
  }

  // 4. Compilations, full albums, jukeboxes, long mixes, listicles
  for (const pattern of BANNED_COMPILATION_PATTERNS) {
    if (pattern.test(t) || pattern.test(c)) {
      return { acceptable: false, reason: "Long mix / compilation / full album" };
    }
  }

  // 5. Devotional & religious audio
  for (const pattern of BANNED_DEVOTIONAL_PATTERNS) {
    if (pattern.test(t) || pattern.test(c)) {
      return { acceptable: false, reason: "Devotional / religious audio" };
    }
  }

  // 6. Ambient, sleep, rain, relaxation
  for (const pattern of BANNED_AMBIENT_PATTERNS) {
    if (pattern.test(t) || pattern.test(c)) {
      return { acceptable: false, reason: "Ambient / sleep / relaxation audio" };
    }
  }

  // 7. Karaoke, instrumental remakes, AI covers
  for (const pattern of BANNED_AMATEUR_PATTERNS) {
    if (pattern.test(t)) {
      return { acceptable: false, reason: "Karaoke / instrumental / AI cover" };
    }
  }

  return { acceptable: true };
}

// ---------------------------------------------------------------------------
// 3. Playability & Embeddability Verification
// ---------------------------------------------------------------------------
export function isPlayableTrack(video: {
  id: string;
  duration?: number;
  isMadeForKids?: boolean;
  embeddable?: boolean;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
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

  // Duration must be valid music length when known (1:30 to 8:00)
  if (typeof video.duration === "number" && video.duration > 0) {
    if (video.duration < 90 || video.duration > 480) {
      return false;
    }
  }

  // Thumbnail / Portrait Cover Safeguard: Reject if height > width (portrait)
  if (
    typeof video.thumbnailWidth === "number" &&
    typeof video.thumbnailHeight === "number" &&
    video.thumbnailWidth > 0 &&
    video.thumbnailHeight > video.thumbnailWidth
  ) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// 4. Multi-Factor Curated Scoring & Relative Popularity Engine
// ---------------------------------------------------------------------------

export interface CuratedScoreBreakdown {
  relativePopularity: number; // 0 - 35 pts (percentile rank within candidate pool)
  velocityHype: number;       // 0 - 25 pts (daily momentum)
  officialAuthority: number;  // 0 - 30 pts (Topic, VEVO, verified label, Official Video)
  sectionAffinity: number;    // 0 - 20 pts (language/genre confidence)
  freshnessBoost: number;     // 0 - 15 pts (momentum-guarded recency)
  qualityDuration: number;    // 0 - 10 pts (ideal single length)
  demerits: number;           // 0 to -40 pts (generic uploaders, low engagement)
  totalScore: number;
}

/**
 * Calculates a multi-factor curated quality score for a candidate track,
 * combining relative pool popularity, daily hype, official release authority, and quality safeguards.
 */
export function calculateCuratedTrackScore(
  track: {
    publishedAt?: string;
    viewCount?: number;
    title: string;
    artist: string;
    channelTitle?: string;
    duration?: number;
  },
  relativePercentile: number, // 0.0 to 1.0 rank within the candidate pool
  sectionConfidence = 0.8
): CuratedScoreBreakdown {
  const now = Date.now();
  const pubTimestamp = track.publishedAt ? Date.parse(track.publishedAt) : 0;
  const daysSincePublished =
    pubTimestamp > 0 && !isNaN(pubTimestamp)
      ? Math.max(0.2, (now - pubTimestamp) / (1000 * 60 * 60 * 24))
      : 365;

  const viewCount = Math.max(0, track.viewCount || 0);
  const titleLower = (track.title || "").toLowerCase();
  const channelLower = (track.channelTitle || track.artist || "").toLowerCase();

  // 1. Relative Popularity Score (0 to 35 pts)
  // Higher percentile in current candidate pool yields higher score
  const relativePopularity = Math.round(relativePercentile * 35);

  // 2. Daily Velocity / Hype Momentum (0 to 25 pts)
  const dailyVelocity = viewCount / daysSincePublished;
  const velocityHype = Math.min(25, Math.round(Math.log10(Math.max(1, dailyVelocity)) * 6));

  // 3. Official Channel & Release Authority (0 to 30 pts)
  let officialAuthority = 0;
  const isTopicChannel = channelLower.endsWith("- topic") || channelLower.includes("- topic");
  const isVevo = channelLower.includes("vevo");
  const isMajorLabel = MAJOR_MUSIC_LABELS.some((lbl) => channelLower.includes(lbl));

  if (isTopicChannel) {
    officialAuthority += 30; // Direct audio-first official release from YouTube Music
  } else if (isVevo || isMajorLabel) {
    officialAuthority += 25;
  } else if (channelLower.includes("official") || channelLower.includes("records")) {
    officialAuthority += 15;
  }

  // Boost for explicit official release markers in title
  if (titleLower.includes("official music video") || titleLower.includes("official audio")) {
    officialAuthority = Math.max(officialAuthority, officialAuthority + 10);
  } else if (titleLower.includes("official video") || titleLower.includes("lyric video")) {
    officialAuthority = Math.max(officialAuthority, officialAuthority + 6);
  }
  officialAuthority = Math.min(30, officialAuthority);

  // 4. Section Match Affinity (0 to 20 pts)
  let sectionAffinity = 0;
  if (sectionConfidence >= 0.8) {
    sectionAffinity = 20;
  } else if (sectionConfidence >= 0.5) {
    sectionAffinity = 8;
  } else {
    sectionAffinity = -30; // Heavy penalty for language/genre mismatch
  }

  // 5. Freshness with Velocity Guard (0 to 15 pts)
  // A brand new video only receives a freshness boost if it has genuine momentum
  let freshnessBoost = 0;
  if (daysSincePublished <= 14 && dailyVelocity >= 1000) {
    freshnessBoost = 15;
  } else if (daysSincePublished <= 60 && dailyVelocity >= 300) {
    freshnessBoost = 10;
  } else if (daysSincePublished <= 180 && dailyVelocity >= 100) {
    freshnessBoost = 5;
  } else if (daysSincePublished > 1460 && dailyVelocity < 50) {
    freshnessBoost = -15; // Stale low-performing archive video
  }

  // 6. Quality & Duration Sweet Spot (0 to 10 pts)
  let qualityDuration = 0;
  const dur = track.duration || 0;
  if (dur >= 120 && dur <= 330) {
    qualityDuration = 10; // 2:00 to 5:30 (standard radio & streaming single)
  } else if (dur > 330 && dur <= 450) {
    qualityDuration = 5;
  }

  // 7. Demerit Deductions (-10 to -40 pts)
  let demerits = 0;
  // Generic / spammy channel names
  if (
    /\b(?:music\s*world|dj\s*remix|all\s*hits|status\s*creation|bass\s*boosted|lofi\s*vibes)\b/i.test(
      channelLower
    )
  ) {
    demerits -= 25;
  }
  // Suspicious low view count on older tracks
  if (daysSincePublished > 30 && viewCount < 10000) {
    demerits -= 20;
  }

  const totalScore =
    relativePopularity +
    velocityHype +
    officialAuthority +
    sectionAffinity +
    freshnessBoost +
    qualityDuration +
    demerits;

  return {
    relativePopularity,
    velocityHype,
    officialAuthority,
    sectionAffinity,
    freshnessBoost,
    qualityDuration,
    demerits,
    totalScore,
  };
}

/**
 * Filter, validate, deduplicate, and rank an array of candidate tracks for a given section.
 * Operates as a Spotify / Apple Music-grade curation pipeline.
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

  // Step 1: Apply Hard Quality Filters, Shorts Filters, and Section Eligibility
  const acceptedCandidates: { track: T; confidence: number; durSec: number; viewCount: number }[] = [];

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

    // Hard Shorts Filter
    if (isShortsVideo(title, desc, durSec)) {
      continue;
    }

    // Hard Catalog Quality Filter (anti-mix, anti-karaoke, anti-reaction, anti-spam)
    const catalogCheck = isAcceptableCatalogTrack(title, artist, desc, durSec);
    if (!catalogCheck.acceptable) {
      continue;
    }

    // Playability Filter (duration boundary when known)
    if (durSec > 0 && (durSec < 55 || durSec > 480)) {
      continue;
    }

    // Section Content & Language Validation
    let confidence = 0.85;
    if (isMevoPulse) {
      // REQUIREMENT 1: Strictly EXCLUDE all Bengali songs from appearing in MEVO Pulse
      if (isBengaliTrack({ title, artist, channelTitle: item.channelTitle || artist, description: desc, section: item.section })) {
        continue;
      }
    } else {
      const isBengalEcho = sectionId === "bengal-echo" || sectionId === "bangla";
      if (isBengalEcho) {
        const echoCheck = validateBengalEchoTrack({
          title,
          artist,
          channelTitle: item.channelTitle || artist,
          description: desc,
          duration: durSec,
          thumbnailWidth: item.thumbnailWidth ?? item.thumbWidth,
          thumbnailHeight: item.thumbnailHeight ?? item.thumbHeight,
        });
        if (!echoCheck.isValid) {
          continue;
        }
      }

      const isEnglishEssence = sectionId === "english-essence" || sectionId === "english";
      if (isEnglishEssence) {
        const engCheck = validateEnglishEssenceTrack({
          title,
          artist,
          channelTitle: item.channelTitle || artist,
          description: desc,
          duration: durSec,
          thumbnailWidth: item.thumbnailWidth ?? item.thumbWidth,
          thumbnailHeight: item.thumbnailHeight ?? item.thumbHeight,
        });
        if (!engCheck.isValid) {
          continue;
        }
      }

      const validation = validateSectionEligibility(
        {
          title,
          artist,
          channelTitle: item.channelTitle || artist,
          description: desc,
          duration: durSec,
          thumbnailWidth: item.thumbnailWidth ?? item.thumbWidth,
          thumbnailHeight: item.thumbnailHeight ?? item.thumbHeight,
        },
        sectionId
      );

      if (!validation.isValid) {
        continue;
      }
      confidence = validation.confidence;
    }

    acceptedCandidates.push({
      track: item,
      confidence,
      durSec,
      viewCount: Math.max(0, item.viewCount || 0),
    });
  }

  if (acceptedCandidates.length === 0) {
    return [];
  }

  // Step 2: Compute Relative Pool Popularity Percentiles
  // Sort by viewCount ascending to calculate percentile rank (0 to 1)
  acceptedCandidates.sort((a, b) => a.viewCount - b.viewCount);
  const totalAccepted = acceptedCandidates.length;

  const scoredCandidates: { track: T; score: number }[] = [];

  for (let i = 0; i < totalAccepted; i++) {
    const entry = acceptedCandidates[i];
    const percentile = totalAccepted > 1 ? i / (totalAccepted - 1) : 0.8;

    const breakdown = calculateCuratedTrackScore(
      {
        title: entry.track.title || "",
        artist: entry.track.artist || entry.track.channelTitle || "",
        channelTitle: entry.track.channelTitle || entry.track.artist || "",
        publishedAt: entry.track.publishedAt,
        viewCount: entry.viewCount,
        duration: entry.durSec,
      },
      percentile,
      entry.confidence
    );

    scoredCandidates.push({ track: entry.track, score: breakdown.totalScore });
  }

  // Step 3: Sort strictly by Curated Score descending
  scoredCandidates.sort((a, b) => b.score - a.score);

  return scoredCandidates.map((c) => c.track);
}
