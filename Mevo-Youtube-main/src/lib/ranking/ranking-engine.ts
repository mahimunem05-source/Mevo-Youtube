/**
 * Local-First Anonymous Hybrid Ranking — single, centralised implementation.
 *
 * Every homepage section, section page and collection uses this module; there
 * is no second ranking calculation anywhere in the app.
 *
 * Priority order (highest first):
 *   1. Admin pinned position / manual order / exclusion   (outside the score)
 *   2. Controlled new-song discovery positions            (slots 5–10)
 *   3. Global hybrid performance score                    (65% + 15%)
 *   4. Local device/browser preference                    (10%)
 *   5. Small freshness boost                              (10%)
 */

import { localPreferenceScore, readLocalPreferences } from "./local-preferences";
import {
  EMPTY_ENGAGEMENT,
  EMPTY_PREFERENCE_PROFILE,
  type LocalPreferenceProfile,
  type RankableSong,
  type RankingSignals,
} from "./types";

// ---------------------------------------------------------------- constants

const HOUR_MS = 60 * 60 * 1000;

/** Freshness stage boundaries, in hours since publication. */
export const FRESHNESS_STAGES = {
  /** 0–48h: strong controlled discovery boost + reserved slots. */
  discoveryHours: 48,
  /** Day 3–4: medium freshness boost. */
  mediumHours: 96,
  /** Day 5–7: small freshness boost. */
  smallHours: 168,
} as const;

/** Score weights — admin controls sit outside these percentages. */
export const SCORE_WEIGHTS = {
  global: 0.65,
  recent: 0.15,
  local: 0.1,
  freshness: 0.1,
} as const;

/** Reserved discovery positions (0-based) → visible positions 5–10. */
const DISCOVERY_SLOTS = [4, 6, 8] as const;
/** Max discovery slots filled per section. */
const MAX_DISCOVERY_SLOTS_PER_SECTION = 2;
/** A single new song may take a discovery slot in at most this many sections. */
const MAX_SECTIONS_PER_NEW_SONG = 2;
/** Discovery rotation window — the running order rotates every 10 minutes. */
const ROTATION_WINDOW_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------- utilities

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function logNormalize(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return 0;
  return clamp01(Math.log1p(value) / Math.log1p(max));
}

function safeRatio(numerator: number, denominator: number): number {
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;
  return clamp01(numerator / denominator);
}

/** Age of a song in hours, based on its real publication timestamp. */
export function ageInHours(publishedAt: number, now: number): number {
  if (!Number.isFinite(publishedAt) || publishedAt <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(0, (now - publishedAt) / HOUR_MS);
}

/**
 * Continuous, monotonically decaying freshness (0..1):
 *   0h → 1.00 | 48h → 0.60 | 96h → 0.30 | 168h → 0.00 | older → 0
 * Piecewise-linear, so visibility never drops off a cliff at 48h.
 */
export function freshnessBoost(ageHours: number): number {
  const { discoveryHours, mediumHours, smallHours } = FRESHNESS_STAGES;

  if (!Number.isFinite(ageHours) || ageHours >= smallHours) return 0;
  if (ageHours <= 0) return 1;

  if (ageHours <= discoveryHours) {
    return 1 - (ageHours / discoveryHours) * 0.4; // 1.00 → 0.60
  }

  if (ageHours <= mediumHours) {
    const progress = (ageHours - discoveryHours) / (mediumHours - discoveryHours);
    return 0.6 - progress * 0.3; // 0.60 → 0.30
  }

  const progress = (ageHours - mediumHours) / (smallHours - mediumHours);
  return 0.3 - progress * 0.3; // 0.30 → 0.00
}

export type FreshnessStage = "discovery" | "medium" | "small" | "none";

export function freshnessStage(ageHours: number): FreshnessStage {
  if (ageHours <= FRESHNESS_STAGES.discoveryHours) return "discovery";
  if (ageHours <= FRESHNESS_STAGES.mediumHours) return "medium";
  if (ageHours <= FRESHNESS_STAGES.smallHours) return "small";
  return "none";
}

// ------------------------------------------------------------------ context

export interface RankingContextOptions {
  signals: Map<string, RankingSignals>;
  preferences?: LocalPreferenceProfile;
  now?: number;
}

interface Maxima {
  validPlays: number;
  recentValidPlays: number;
  playCount: number;
  uniqueSessions: number;
  repeatPlays: number;
}

export interface RankingContext {
  signals: Map<string, RankingSignals>;
  preferences: LocalPreferenceProfile;
  now: number;
  maxima: Maxima;
  /** Discovery exposure ledger — shared across all sections of one page load. */
  discoveryExposure: Map<string, number>;
  rotationSeed: number;
}

/**
 * Builds the shared context for one page load. Global maxima are computed once
 * across the whole catalogue so scores are comparable between sections.
 */
export function createRankingContext(options: RankingContextOptions): RankingContext {
  const now = options.now ?? Date.now();
  const maxima: Maxima = {
    validPlays: 0,
    recentValidPlays: 0,
    playCount: 0,
    uniqueSessions: 0,
    repeatPlays: 0,
  };

  for (const signal of options.signals.values()) {
    const engagement = signal.engagement;
    maxima.validPlays = Math.max(maxima.validPlays, engagement.validPlays);
    maxima.recentValidPlays = Math.max(maxima.recentValidPlays, engagement.recentValidPlays);
    maxima.playCount = Math.max(maxima.playCount, signal.playCount);
    maxima.uniqueSessions = Math.max(maxima.uniqueSessions, engagement.uniqueSessions);
    maxima.repeatPlays = Math.max(maxima.repeatPlays, engagement.repeatPlays);
  }

  return {
    signals: options.signals,
    preferences: options.preferences ?? EMPTY_PREFERENCE_PROFILE,
    now,
    maxima,
    discoveryExposure: new Map(),
    rotationSeed: Math.floor(now / ROTATION_WINDOW_MS),
  };
}

/** Convenience wrapper that reads this device's anonymous profile safely. */
export function createRankingContextForDevice(
  signals: Map<string, RankingSignals>,
  now?: number,
): RankingContext {
  return createRankingContext({
    signals,
    preferences: readLocalPreferences(),
    now,
  });
}

// ------------------------------------------------------------------- scoring

export interface ScoreBreakdown {
  global: number;
  recent: number;
  local: number;
  freshness: number;
  adminBoost: number;
  total: number;
  ageHours: number;
  stage: FreshnessStage;
  discoveryEligible: boolean;
}

const NEUTRAL_SIGNAL: Omit<RankingSignals, "id"> = {
  publishedAt: 0,
  duration: 0,
  playCount: 0,
  published: true,
  adminExcluded: false,
  adminPinnedPosition: null,
  adminManualOrder: null,
  adminBoost: 0,
  engagement: EMPTY_ENGAGEMENT,
};

export function getSignal(context: RankingContext, songId: string): RankingSignals {
  return context.signals.get(songId) ?? { id: songId, ...NEUTRAL_SIGNAL };
}

/** Global engagement & popularity component (0..1). */
function globalEngagementScore(signal: RankingSignals, maxima: Maxima): number {
  const e = signal.engagement;
  const attempts = e.validPlays + e.skips;
  const completionRate = safeRatio(e.completedPlays, Math.max(1, e.validPlays));
  const skipRate = attempts > 0 ? safeRatio(e.skips, attempts) : 0;
  const averageListen = e.validPlays > 0 ? e.totalListenedSeconds / e.validPlays : 0;
  const listenDepth = signal.duration > 0 ? safeRatio(averageListen, signal.duration) : 0;

  return clamp01(
    0.3 * logNormalize(e.validPlays, maxima.validPlays) +
      0.1 * logNormalize(signal.playCount, maxima.playCount) +
      0.2 * completionRate +
      0.15 * listenDepth +
      0.1 * (1 - skipRate) +
      0.1 * logNormalize(e.uniqueSessions, maxima.uniqueSessions) +
      0.05 * logNormalize(e.repeatPlays, maxima.repeatPlays),
  );
}

/** Recent / trending component (0..1). */
function recentPerformanceScore(signal: RankingSignals, maxima: Maxima, now: number): number {
  const recent = logNormalize(signal.engagement.recentValidPlays, maxima.recentValidPlays);

  const lastPlayAt = signal.engagement.lastPlayAt;
  const recency = lastPlayAt ? clamp01(1 - (now - lastPlayAt) / (7 * 24 * HOUR_MS)) : 0;

  return clamp01(0.7 * recent + 0.3 * recency);
}

export function scoreSong(song: RankableSong, context: RankingContext): ScoreBreakdown {
  const signal = getSignal(context, song.id);
  const age = ageInHours(signal.publishedAt, context.now);
  const stage = freshnessStage(age);

  const global = globalEngagementScore(signal, context.maxima);
  const recent = recentPerformanceScore(signal, context.maxima, context.now);
  const local = localPreferenceScore(song, context.preferences);
  const freshness = freshnessBoost(age);

  // A new song that matches this device's taste gets a small extra local nudge.
  const newSongLocalBonus = stage === "none" ? 0 : 0.03 * local * freshness;

  const total =
    SCORE_WEIGHTS.global * global +
    SCORE_WEIGHTS.recent * recent +
    SCORE_WEIGHTS.local * local +
    SCORE_WEIGHTS.freshness * freshness +
    newSongLocalBonus +
    // Admin manual boost is deliberately outside the weighted percentages.
    (Number.isFinite(signal.adminBoost) ? signal.adminBoost : 0);

  return {
    global,
    recent,
    local,
    freshness,
    adminBoost: signal.adminBoost,
    total,
    ageHours: age,
    stage,
    discoveryEligible:
      stage === "discovery" &&
      signal.published &&
      !signal.adminExcluded &&
      signal.adminPinnedPosition === null &&
      signal.adminManualOrder === null,
  };
}

// ------------------------------------------------------------------ ranking

export interface RankOptions {
  /** Identifies the section for discovery-slot bookkeeping. */
  sectionKey: string;
  /** Set to false to skip reserved discovery slots (e.g. search results). */
  enableDiscoverySlots?: boolean;
}

/**
 * Ranks one section's songs.
 *
 * Unpublished / admin-excluded songs are removed first, so they can never
 * receive discovery exposure.
 */
export function rankSongs<T extends RankableSong>(
  songs: readonly T[],
  context: RankingContext,
  options: RankOptions,
): T[] {
  if (!songs || !Array.isArray(songs) || songs.length === 0) return [];

  // De-duplicate defensively: the same song must never appear twice.
  const unique: T[] = [];
  const seen = new Set<string>();
  for (const song of songs) {
    const id = String(song.id);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(song);
  }

  const eligible = unique.filter((song) => {
    const signal = getSignal(context, String(song.id));
    return signal.published && !signal.adminExcluded;
  });

  if (eligible.length === 0) return [];

  const scored = eligible.map((song) => ({
    song,
    id: String(song.id),
    signal: getSignal(context, String(song.id)),
    score: scoreSong(song, context),
  }));

  // 1. Admin manual order always leads, in the admin's own order.
  const manual = scored
    .filter((item) => item.signal.adminManualOrder !== null)
    .sort((a, b) => (a.signal.adminManualOrder ?? 0) - (b.signal.adminManualOrder ?? 0));

  const pinned = scored.filter(
    (item) => item.signal.adminManualOrder === null && item.signal.adminPinnedPosition !== null,
  );

  const algorithmic = scored
    .filter(
      (item) => item.signal.adminManualOrder === null && item.signal.adminPinnedPosition === null,
    )
    .sort((a, b) => {
      if (b.score.total !== a.score.total) return b.score.total - a.score.total;
      if (b.signal.publishedAt !== a.signal.publishedAt) {
        return b.signal.publishedAt - a.signal.publishedAt;
      }
      return a.id.localeCompare(b.id);
    });

  let ordered = [...manual.map((item) => item.song), ...algorithmic.map((item) => item.song)];

  // 2. Controlled discovery placement for brand-new songs (0–48h).
  if (options.enableDiscoverySlots !== false) {
    ordered = applyDiscoverySlots(ordered, scored, context, options.sectionKey);
  }

  // 3. Admin pinned positions are applied last so nothing can displace them.
  for (const item of pinned.sort(
    (a, b) => (a.signal.adminPinnedPosition ?? 0) - (b.signal.adminPinnedPosition ?? 0),
  )) {
    const target = Math.max(
      0,
      Math.min(ordered.length, (item.signal.adminPinnedPosition ?? 1) - 1),
    );
    ordered.splice(target, 0, item.song);
  }

  return ordered;
}

/**
 * Reserves 1–2 rotating positions (visible 5–10) per section for songs younger
 * than 48 hours, rotating fairly between them and capping how many sections a
 * single new song can occupy at once.
 */
function applyDiscoverySlots<T extends RankableSong>(
  ordered: T[],
  scored: Array<{ song: T; id: string; score: ScoreBreakdown }>,
  context: RankingContext,
  sectionKey: string,
): T[] {
  const candidates = scored.filter((item) => item.score.discoveryEligible);
  if (candidates.length === 0 || ordered.length < 2) return ordered;

  // Fair rotation: newest-first base order, rotated by the time window and the
  // section, so no single upload monopolises the discovery slots.
  const base = [...candidates].sort((a, b) => {
    const exposureA = context.discoveryExposure.get(a.id) ?? 0;
    const exposureB = context.discoveryExposure.get(b.id) ?? 0;
    if (exposureA !== exposureB) return exposureA - exposureB;
    return b.score.total - a.score.total;
  });

  const offset = (context.rotationSeed + hashString(sectionKey)) % base.length;
  const rotated = [...base.slice(offset), ...base.slice(0, offset)];

  const picks = rotated
    .filter((item) => (context.discoveryExposure.get(item.id) ?? 0) < MAX_SECTIONS_PER_NEW_SONG)
    .slice(0, MAX_DISCOVERY_SLOTS_PER_SECTION);

  if (picks.length === 0) return ordered;

  const pickedIds = new Set(picks.map((item) => item.id));
  const rest = ordered.filter((song) => !pickedIds.has(String(song.id)));
  const result = [...rest];

  picks.forEach((item, index) => {
    const desired = DISCOVERY_SLOTS[index] ?? DISCOVERY_SLOTS[0];
    const target = Math.min(desired, result.length);
    result.splice(target, 0, item.song);
    context.discoveryExposure.set(item.id, (context.discoveryExposure.get(item.id) ?? 0) + 1);
  });

  return result;
}

function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100_003;
  }
  return Math.abs(hash);
}
