/**
 * React entry point for the centralised ranking system.
 *
 * Any page/section calls `useRanking()` once and then ranks its lists with the
 * returned `rank(songs, sectionKey)` helper — a single shared context per page
 * load, which is what makes the discovery-slot fairness and the
 * "no duplicates across sections" rule work.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabase";
import { subscribeToRealtimeChanges } from "@/lib/realtime-helper";
import { getRankingSignals } from "@/lib/ranking/engagement-service";
import { readLocalPreferences } from "@/lib/ranking/local-preferences";
import { createRankingContext, rankSongs, type RankingContext } from "@/lib/ranking/ranking-engine";
import type { RankableSong, RankingSignals } from "@/lib/ranking/types";

export interface UseRankingResult {
  isReady: boolean;
  context: RankingContext;
  rank: <T extends RankableSong>(
    songs: readonly T[],
    sectionKey: string,
    options?: { enableDiscoverySlots?: boolean },
  ) => T[];
}

export function useRanking(): UseRankingResult {
  const [signals, setSignals] = useState<Map<string, RankingSignals>>(() => new Map());
  const [isReady, setIsReady] = useState(false);
  const [preferenceVersion, setPreferenceVersion] = useState(0);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        const loaded = await getRankingSignals();
        if (isMounted) setSignals(loaded);
      } catch (error) {
        // Ranking must never break a page — fall back to neutral signals.
        console.error("Ranking: signal load failed", error);
      } finally {
        if (isMounted) setIsReady(true);
      }
    }

    void load();

    const cleanup = subscribeToRealtimeChanges("ranking-signals", [
      {
        table: "song_engagement",
        callback: () => {
          void load();
        },
      },
    ]);

    return () => {
      isMounted = false;
      cleanup();
    };
  }, []);

  // Local preferences live in this browser only; re-read them when the tab
  // regains focus so a fresh listen is reflected without a reload.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const onFocus = () => setPreferenceVersion((value) => value + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const context = useMemo(
    () =>
      createRankingContext({
        signals,
        preferences: readLocalPreferences(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signals, preferenceVersion],
  );

  const rank = useCallback(
    <T extends RankableSong>(
      songs: readonly T[],
      sectionKey: string,
      options?: { enableDiscoverySlots?: boolean },
    ) =>
      rankSongs(songs, context, {
        sectionKey,
        enableDiscoverySlots: options?.enableDiscoverySlots,
      }),
    [context],
  );

  return { isReady, context, rank };
}
