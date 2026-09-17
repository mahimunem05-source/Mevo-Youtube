/**
 * Dedicated Search-Only Ranking Engine for MEVO
 * 
 * Implements an independent, broad YouTube search ranking layer:
 * - Gives highest ranking preference to original / official releases
 * - Applies ranking penalties (NOT EXCLUSION) to variants:
 *   slowed, reverb, sped up, remix, cover, live, acoustic, instrumental,
 *   karaoke, nightcore, lo-fi, mashup, 8D, bass boosted, edit
 * - If user explicitly queries for a variant (e.g. "Tum Hi Ho Slowed"),
 *   that variant is boosted instead of penalized
 * - Deduplicates strictly by exact video ID (different versions are kept)
 * - Home page curation/filtering remains 100% untouched
 */

import type { YouTubeSearchResult } from "./youtube.ts";

export const OFFICIAL_RECORD_LABELS = [
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

export interface VariantPenaltyRule {
  regex: RegExp;
  penalty: number;
  tag: string;
}

export const VARIANT_PENALTY_RULES: VariantPenaltyRule[] = [
  { regex: /\b(?:slowed(?:\s*(?:and|&|\+)\s*reverb)?|slow\s*(?:and|&|\+)\s*reverb|reverb)\b/i, penalty: 30, tag: "slowed" },
  { regex: /\b(?:sped\s*up|speed\s*up|fast\s*version)\b/i, penalty: 30, tag: "speed_up" },
  { regex: /\b(?:nightcore)\b/i, penalty: 30, tag: "nightcore" },
  { regex: /\b(?:remix(?:ed)?|club\s*mix|dj\s*mix|dance\s*mix|edm)\b/i, penalty: 25, tag: "remix" },
  { regex: /\b(?:cover|female\s*version|male\s*version)\b/i, penalty: 25, tag: "cover" },
  { regex: /\b(?:live(?:\s*at|\s*in|\s*performance|\s*concert)?|unplugged)\b/i, penalty: 20, tag: "live" },
  { regex: /\b(?:acoustic|guitar\s*version|piano\s*version)\b/i, penalty: 20, tag: "acoustic" },
  { regex: /\b(?:instrumental|karaoke|backing\s*track|karaoke\s*track)\b/i, penalty: 35, tag: "instrumental" },
  { regex: /\b(?:lo-?fi|chill\s*mix|ambient)\b/i, penalty: 20, tag: "lofi" },
  { regex: /\b(?:mashup|mash\s*up|medley)\b/i, penalty: 25, tag: "mashup" },
  { regex: /\b(?:8d(?:\s*audio)?|bass\s*boosted)\b/i, penalty: 30, tag: "8d" },
  { regex: /\b(?:fan\s*edit|edit\s*audio|status\s*video|whatsapp\s*status)\b/i, penalty: 40, tag: "edit" },
  { regex: /\b(?:1\s*hour|10\s*hours?|hour\s*loop|hours\s*loop)\b/i, penalty: 45, tag: "loop" },
];

/**
 * Calculates search ranking score for a candidate YouTube video.
 * Original/official releases rank highest when available,
 * and variants remain discoverable without being excluded.
 */
export function calculateSearchRankScore(
  query: string,
  item: YouTubeSearchResult,
  naturalIndex = 0
): number {
  const qLower = (query || "").toLowerCase().trim();
  const titleLower = (item.title || "").toLowerCase();
  const channelLower = (item.channel || "").toLowerCase();
  const descLower = (item.description || "").toLowerCase();

  let score = 100;

  // 1. YouTube Natural Order baseline
  score += Math.max(0, 40 - naturalIndex * 2);

  // 2. High Positive: Exact & Near-Exact Title Match
  const cleanQ = qLower.replace(/[^\w\s\u0980-\u09FF\u0900-\u097F]/g, "").replace(/\s+/g, " ").trim();
  const cleanT = titleLower.replace(/[^\w\s\u0980-\u09FF\u0900-\u097F]/g, "").replace(/\s+/g, " ").trim();

  if (cleanT === cleanQ) {
    score += 120;
  } else if (cleanT.startsWith(cleanQ)) {
    score += 80;
  } else if (titleLower.includes(qLower)) {
    score += 50;
  }

  // 3. Query Term Matching
  const qTokens = cleanQ.split(/\s+/).filter((t) => t.length > 1);
  let matchedTokens = 0;
  for (const token of qTokens) {
    if (titleLower.includes(token)) {
      matchedTokens++;
      score += 15;
    } else if (channelLower.includes(token)) {
      matchedTokens++;
      score += 10;
    } else if (descLower.includes(token)) {
      score += 3;
    }
  }
  if (qTokens.length > 1 && matchedTokens === qTokens.length) {
    score += 30; // Complete multi-word match
  }

  // 4. Official Channel & Audio Signals (HIGH POSITIVE)
  if (channelLower.includes("- topic") || channelLower.endsWith("- topic")) {
    score += 65; // YouTube auto-generated high fidelity official audio
  }
  for (const label of OFFICIAL_RECORD_LABELS) {
    if (channelLower.includes(label)) {
      score += 50;
      break;
    }
  }
  if (channelLower.includes("official") || channelLower.includes("vevo")) {
    score += 40;
  }
  if (titleLower.includes("official audio") || titleLower.includes("official music video")) {
    score += 45;
  } else if (
    titleLower.includes("official video") ||
    titleLower.includes("original audio") ||
    titleLower.includes("original song")
  ) {
    score += 30;
  }

  // 5. Negative Ranking for Variants (PENALTY ONLY — NEVER EXCLUSION)
  // If user explicitly queries the variant word, boost it instead of penalizing!
  for (const rule of VARIANT_PENALTY_RULES) {
    if (rule.regex.test(titleLower) || rule.regex.test(descLower)) {
      const userAskedForVariant = rule.regex.test(qLower);
      if (userAskedForVariant) {
        score += 55; // User explicitly searched for this variant!
      } else {
        score -= rule.penalty; // Natural penalty so original ranks higher
      }
    }
  }

  return score;
}

/**
 * Deduplicates search results strictly by exact YouTube Video ID.
 * Different variants ("Song X", "Song X Slowed", "Song X Remix")
 * have different video IDs and MUST remain separate results.
 */
export function deduplicateSearchVideoIds(items: YouTubeSearchResult[]): YouTubeSearchResult[] {
  if (!Array.isArray(items) || items.length === 0) return [];
  const seen = new Set<string>();
  const out: YouTubeSearchResult[] = [];

  for (const it of items) {
    if (!it || !it.id) continue;
    const cleanId = it.id.replace(/^yt-/, "").trim();
    if (seen.has(cleanId)) continue;
    seen.add(cleanId);
    out.push(it);
  }

  return out;
}

/**
 * Master Search Ranking Function:
 * Deduplicates by video ID and ranks original/official first,
 * followed by relevant variants without dropping anything.
 */
export function rankSearchResults(
  query: string,
  items: YouTubeSearchResult[]
): YouTubeSearchResult[] {
  const uniqueItems = deduplicateSearchVideoIds(items);
  if (uniqueItems.length <= 1) return uniqueItems;

  const scored = uniqueItems.map((item, index) => ({
    item,
    score: calculateSearchRankScore(query, item, index),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.map((s) => s.item);
}
