import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";

import {
  belongsToSection,
  recentlyPlayedSection,
  replaceRuntimeSongs,
  sections,
  trendingSection,
  type DisplaySection,
  type SectionId,
  type Song as PlayerSong,
} from "@/data/songs";
import { getSongs } from "@/services/songService";
import { databaseSongToPlayerSong } from "@/lib/song-adapter";
import { subscribeToRealtimeChanges } from "@/lib/realtime-helper";
import { usePlayer } from "@/lib/player-context";
import { playbackEvents } from "@/lib/playback-events";
import { HOME_SECTIONS } from "@/lib/category-config";
import {
  fetchYouTubeTrending,
  fetchYouTubeCategoryTracks,
} from "@/services/youtube";
import {
  fetchUserQuickPicks,
  getLastPlayedTrack,
  rankCategoriesByAffinity,
  rankTracksByAffinity,
  getTasteSummary,
} from "@/lib/user-taste";
import { mergePrependedTracks } from "@/lib/category-matcher";
import { setCachedCatalogue } from "@/lib/music-library";

import { HeroBanner } from "@/components/music/hero-banner";
import { SectionRow } from "@/components/music/section-row";
import { ResumeListeningCard } from "@/components/music/resume-listening-card";
import { HomepageSkeleton, HeroBannerSkeleton } from "@/components/music/skeletons";
import {
  getHeroSettings,
  getHeroSongsRecords,
  getCurrentHeroPeriod,
} from "@/services/heroService";
import { DEFAULT_HERO_SETTINGS } from "@/types/hero";

function RecentlyPlayedRow() {
  const { recent } = usePlayer();
  if (recent.length === 0) return null;
  return <SectionRow section={recentlyPlayedSection} songs={recent} />;
}

function ResumeListeningSection() {
  const [lastPlayed, setLastPlayed] = useState(() => getLastPlayedTrack());

  useEffect(() => {
    const update = () => setLastPlayed(getLastPlayedTrack());
    const unsubs = [
      playbackEvents.on("SONG_CHANGE", update),
      playbackEvents.on("PLAY", update),
    ];
    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, []);

  if (!lastPlayed?.song) return null;
  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 md:px-12">
      <ResumeListeningCard song={lastPlayed.song} progress={lastPlayed.progress} />
    </div>
  );
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "MEVO — Evolution of Sound",
      },
      {
        name: "description",
        content:
          "Discover millions of songs, playlists and artists. Stream instantly with immersive sound on MEVO.",
      },
      {
        property: "og:title",
        content: "MEVO — Evolution of Sound",
      },
      {
        property: "og:description",
        content: "Bengal Echo, Soft Hindi Reverie, and Global hits in one YouTube-first streaming player.",
      },
    ],
  }),
  component: Index,
});

export function Index() {
  const queryClient = useQueryClient();

  // 1. YouTube Categories Query (Parallel Fetching + 15 min SWR Cache)
  const youtubeSectionsQuery = useQuery({
    queryKey: ["homepage-youtube-sections"],
    queryFn: async () => {
      const results: Record<string, PlayerSong[]> = {
        "mevo-pulse": [],
        "bengal-echo": [],
        "hindi-reverie": [],
        "english-essence": [],
        "boost-aura": [],
        "sonic-world": [],
      };

      const settledResults = await Promise.allSettled(
        HOME_SECTIONS.map(async (sec) => {
          if (sec.source !== "youtube") return { id: sec.id, songs: [] };
          try {
            if (sec.type === "chart") {
              const songs = await fetchYouTubeTrending(
                sec.regionCode || "BD",
                20,
                "bangla",
                sec.title
              );
              return { id: sec.id, songs };
            } else if (sec.type === "search" && sec.query) {
              const sectionId: SectionId =
                sec.id === "bengal-echo"
                  ? "bangla"
                  : sec.id === "hindi-reverie"
                    ? "hindi"
                    : sec.id === "english-essence"
                      ? "english"
                      : sec.id === "boost-aura"
                        ? "boost-aura"
                        : "global";

              const songs = await fetchYouTubeCategoryTracks(
                sec.query,
                sec.order || "relevance",
                20,
                sectionId,
                sec.title
              );
              return { id: sec.id, songs };
            }
          } catch (err) {
            console.warn(`Failed to fetch section ${sec.id} from YouTube:`, err);
          }
          return { id: sec.id, songs: [] };
        })
      );

      for (const res of settledResults) {
        if (res.status === "fulfilled" && res.value) {
          results[res.value.id] = mergePrependedTracks(res.value.id, res.value.songs);
        }
      }
      return results;
    },
    staleTime: 1000 * 60 * 20, // 20 minutes across dev and prod
    gcTime: 1000 * 60 * 60, // 1 hour
    refetchInterval: 1000 * 60 * 20,
    refetchIntervalInBackground: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  // 2. Mahi Select Query (Bound to Local PostgreSQL / Supabase Database)
  const mahiSelectQuery = useQuery({
    queryKey: ["homepage-mahi-select-songs"],
    queryFn: getSongs,
    staleTime: 1000 * 60 * 20, // 20 minutes across dev and prod
    gcTime: 1000 * 60 * 60, // 1 hour
    refetchInterval: 1000 * 60 * 20,
    refetchIntervalInBackground: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  // 3. Hero Settings Query
  const heroQuery = useQuery({
    queryKey: ["homepage-hero-config"],
    queryFn: async () => {
      try {
        const [settings, dayIds, nightIds] = await Promise.all([
          getHeroSettings().catch(() => DEFAULT_HERO_SETTINGS),
          getHeroSongsRecords("day").catch(() => []),
          getHeroSongsRecords("night").catch(() => []),
        ]);
        return {
          settings: settings ?? DEFAULT_HERO_SETTINGS,
          dayIds: dayIds ?? [],
          nightIds: nightIds ?? [],
        };
      } catch (err) {
        console.warn("Hero config fetch error:", err);
        return {
          settings: DEFAULT_HERO_SETTINGS,
          dayIds: [],
          nightIds: [],
        };
      }
    },
    staleTime: import.meta.env.DEV ? 0 : 1000 * 60 * 15,
    gcTime: import.meta.env.DEV ? 0 : 1000 * 60 * 60,
    refetchOnMount: import.meta.env.DEV ? "always" : false,
    refetchOnWindowFocus: import.meta.env.DEV,
    placeholderData: import.meta.env.DEV ? undefined : keepPreviousData,
  });

  const [heroLabel, setHeroLabel] = useState("Today's Pick");

  const databaseSongs = mahiSelectQuery.data ?? [];
  const heroSettings = heroQuery.data?.settings ?? DEFAULT_HERO_SETTINGS;
  const manualDaySongIds = heroQuery.data?.dayIds ?? [];
  const manualNightSongIds = heroQuery.data?.nightIds ?? [];

  // Update Hero Period label periodically
  useEffect(() => {
    const updateLabel = () => {
      const periodInfo = getCurrentHeroPeriod(heroSettings);
      setHeroLabel(periodInfo.label);
    };
    updateLabel();
    const interval = setInterval(updateLabel, 60000);
    return () => clearInterval(interval);
  }, [heroSettings]);

  // Realtime Supabase Channel -> marks caches as stale safely
  useEffect(() => {
    return subscribeToRealtimeChanges("homepage-realtime-sync", [
      {
        table: "songs",
        callback: () => {
          void queryClient.invalidateQueries({
            queryKey: ["homepage-mahi-select-songs"],
            refetchType: "none",
          });
        },
      },
      {
        table: "home_hero_settings",
        callback: () => {
          void queryClient.invalidateQueries({
            queryKey: ["homepage-hero-config"],
            refetchType: "none",
          });
        },
      },
      {
        table: "home_hero_songs",
        callback: () => {
          void queryClient.invalidateQueries({
            queryKey: ["homepage-hero-config"],
            refetchType: "none",
          });
        },
      },
    ]);
  }, [queryClient]);

  // Convert Mahi Select local database songs
  const convertedMahiSelectSongs = useMemo(() => {
    const converted = databaseSongs.map((song) => databaseSongToPlayerSong(song));
    const favourites = converted.filter((song) => belongsToSection(song, "favourite"));
    return favourites.length > 0 ? favourites : converted;
  }, [databaseSongs]);

  const rawYtSections = youtubeSectionsQuery.data ?? {
    "mevo-pulse": [],
    "bengal-echo": [],
    "hindi-reverie": [],
    "english-essence": [],
    "boost-aura": [],
    "sonic-world": [],
  };

  // Stable session ranking version: updates on mount or explicit section changes,
  // NEVER mid-playback (preventing carousel re-ordering & layout jitter while listening).
  const [rankingVersion, setRankingVersion] = useState(0);
  useEffect(() => {
    const bump = () => setRankingVersion((v) => v + 1);

    const unsubs = [
      playbackEvents.on("SECTION_PREPENDED", bump),
    ];

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, []);

  // Section Songs Map with instant prepended tracks merged at index 0
  const ytSectionsData = useMemo(() => {
    return {
      "mevo-pulse": mergePrependedTracks("mevo-pulse", rawYtSections["mevo-pulse"] || []),
      "bengal-echo": mergePrependedTracks("bengal-echo", rawYtSections["bengal-echo"] || []),
      "hindi-reverie": mergePrependedTracks("hindi-reverie", rawYtSections["hindi-reverie"] || []),
      "english-essence": mergePrependedTracks("english-essence", rawYtSections["english-essence"] || []),
      "boost-aura": mergePrependedTracks("boost-aura", rawYtSections["boost-aura"] || []),
      "sonic-world": mergePrependedTracks("sonic-world", rawYtSections["sonic-world"] || []),
    };
  }, [rawYtSections, rankingVersion]);

  // Section Songs Map
  const songsBySection = useMemo<Record<SectionId, PlayerSong[]>>(() => {
    return {
      bangla: ytSectionsData["bengal-echo"] || [],
      favourite: convertedMahiSelectSongs,
      hindi: ytSectionsData["hindi-reverie"] || [],
      english: ytSectionsData["english-essence"] || [],
      "boost-aura": ytSectionsData["boost-aura"] || [],
      global: ytSectionsData["sonic-world"] || [],
    };
  }, [ytSectionsData, convertedMahiSelectSongs]);

  // Entire combined catalogue for runtime lookup & queue building
  const allHomepageCatalogue = useMemo<PlayerSong[]>(() => {
    const list: PlayerSong[] = [];
    const trending = ytSectionsData["mevo-pulse"] || [];
    list.push(...trending);
    for (const sec of HOME_SECTIONS) {
      if (sec.source === "youtube") {
        const secSongs = (ytSectionsData as Record<string, PlayerSong[]>)[sec.id] || [];
        list.push(...secSongs);
      } else {
        list.push(...convertedMahiSelectSongs);
      }
    }
    // Deduplicate by ID
    const seen = new Set<string>();
    return list.filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }, [ytSectionsData, convertedMahiSelectSongs]);

  // Synchronize runtime catalogue & cache
  useEffect(() => {
    if (allHomepageCatalogue.length > 0) {
      replaceRuntimeSongs(allHomepageCatalogue);
      setCachedCatalogue(allHomepageCatalogue);
    }
  }, [allHomepageCatalogue]);

  // Dynamic Mood Badge & Subtitle for Quick Picks
  const tasteSummary = useMemo(() => getTasteSummary(), [rankingVersion]);
  const dynamicQuickPicksSection: DisplaySection = useMemo(
    () => ({
      id: "quick-picks",
      slug: "quick-picks",
      title: tasteSummary.title,
      subtitle: tasteSummary.subtitle,
      badge: tasteSummary.moodBadge,
      variant: "default",
    }),
    [tasteSummary],
  );

  // Quick Picks / Made For You based on True Related & Similar Recommendations Engine
  const quickPicksQuery = useQuery({
    queryKey: [
      "homepage-quick-picks",
      rankingVersion,
      tasteSummary.moodBadge,
      tasteSummary.dominantGenre,
    ],
    queryFn: () => fetchUserQuickPicks(16),
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 60,
    refetchInterval: 1000 * 60 * 20,
    refetchIntervalInBackground: true,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

// Helper to compute strict deduplication keys (by normalized ID and title+artist signature)
function getSongDedupeKeys(song: PlayerSong): string[] {
  const keys: string[] = [];
  const rawId = (song.id || "").replace(/^yt-/, "").trim().toLowerCase();
  if (rawId) keys.push(`id:${rawId}`);

  const titleNorm = (song.title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24);
  const artistNorm = (song.artist || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 16);

  if (titleNorm && artistNorm) {
    keys.push(`sig:${titleNorm}___${artistNorm}`);
  }
  return keys;
}

  const rawQuickPicks = useMemo(() => {
    return mergePrependedTracks("quick-picks", quickPicksQuery.data ?? []);
  }, [quickPicksQuery.data, rankingVersion]);

  // Global Page Feed Deduplication Registry (Strict Zero Duplicate Across Entire Page)
  const { dedupedQuickPicks, displayRows } = useMemo(() => {
    const globalSeen = new Set<string>();

    // A. Deduplicate Quick Picks / Made For You (Target: exactly 15 songs)
    const filteredQuickPicks: PlayerSong[] = [];
    const intraQuickPicksSeen = new Set<string>();
    for (const song of rawQuickPicks) {
      const keys = getSongDedupeKeys(song);
      const isDupe = keys.some((k) => intraQuickPicksSeen.has(k));
      if (!isDupe) {
        for (const k of keys) {
          intraQuickPicksSeen.add(k);
          globalSeen.add(k);
        }
        filteredQuickPicks.push(song);
      }
      if (filteredQuickPicks.length >= 15) break;
    }

    // B. Deduplicate Category Rows (MEVO Pulse, Bengal Echo, Hindi Reverie, etc. Target: exactly 15 songs)
    const rows: { section: DisplaySection; songs: PlayerSong[] }[] = [];
    const prioritizedConfigs = rankCategoriesByAffinity(HOME_SECTIONS);

    for (const config of prioritizedConfigs) {
      let sectionDef: DisplaySection;
      let trackList: PlayerSong[] = [];

      if (config.id === "mevo-pulse") {
        sectionDef = trendingSection;
        trackList = ytSectionsData["mevo-pulse"] || [];
      } else if (config.id === "bengal-echo") {
        sectionDef = sections.find((s) => s.id === "bangla")!;
        trackList = ytSectionsData["bengal-echo"] || [];
      } else if (config.id === "hindi-reverie") {
        sectionDef = sections.find((s) => s.id === "hindi")!;
        trackList = ytSectionsData["hindi-reverie"] || [];
      } else if (config.id === "english-essence") {
        sectionDef = sections.find((s) => s.id === "english")!;
        trackList = ytSectionsData["english-essence"] || [];
      } else if (config.id === "mahi-select") {
        sectionDef = sections.find((s) => s.id === "favourite")!;
        trackList = convertedMahiSelectSongs;
      } else if (config.id === "boost-aura") {
        sectionDef = sections.find((s) => s.id === "boost-aura")!;
        trackList = ytSectionsData["boost-aura"] || [];
      } else if (config.id === "sonic-world") {
        sectionDef = sections.find((s) => s.id === "global")!;
        trackList = ytSectionsData["sonic-world"] || [];
      } else {
        continue;
      }

      if (sectionDef && trackList.length > 0) {
        // Apply Stage-2 dynamic affinity ranking for algorithmically generated rows,
        // while preserving Mahi Select's pristine user/database curated order.
        const rankedTracks =
          config.id === "mahi-select" ? trackList : rankTracksByAffinity(trackList);

        const intraSectionSeen = new Set<string>();
        const uniqueTracks: PlayerSong[] = [];
        const deferredTracks: PlayerSong[] = [];

        for (const song of rankedTracks) {
          const keys = getSongDedupeKeys(song);
          // Never duplicate within the same section carousel
          const isIntraDupe = keys.some((k) => intraSectionSeen.has(k));
          if (isIntraDupe) continue;

          for (const k of keys) intraSectionSeen.add(k);

          // Check if already seen in earlier sections on the page
          const isCrossDupe = keys.some((k) => globalSeen.has(k));
          if (!isCrossDupe) {
            uniqueTracks.push(song);
            for (const k of keys) globalSeen.add(k);
          } else {
            deferredTracks.push(song);
          }
        }

        // Target = exactly 15 valid songs. If cross-section deduplication left fewer than 15,
        // backfill with deferred unique tracks from this section so the section reliably renders 15 cards.
        for (const song of deferredTracks) {
          if (uniqueTracks.length >= 15) break;
          uniqueTracks.push(song);
        }

        const finalSectionSongs = uniqueTracks.slice(0, 15);
        if (finalSectionSongs.length > 0) {
          rows.push({
            section: sectionDef,
            songs: finalSectionSongs,
          });
        }
      }
    }

    return { dedupedQuickPicks: filteredQuickPicks, displayRows: rows };
  }, [rawQuickPicks, ytSectionsData, convertedMahiSelectSongs, rankingVersion]);

  // Manual hero tracks resolution
  const manualHeroSongs = useMemo(() => {
    if (heroSettings.mode !== "manual") return undefined;
    const periodInfo = getCurrentHeroPeriod(heroSettings);
    const ids = periodInfo.period === "day" ? manualDaySongIds : manualNightSongIds;
    if (ids.length === 0) return undefined;
    const songMap = new Map(allHomepageCatalogue.map((s) => [s.id, s]));
    const found = ids.map((id) => songMap.get(id)).filter(Boolean) as PlayerSong[];
    return found.length > 0 ? found : undefined;
  }, [
    heroSettings.mode,
    heroSettings,
    manualDaySongIds,
    manualNightSongIds,
    allHomepageCatalogue,
  ]);

  const isAnythingLoading =
    youtubeSectionsQuery.isLoading || mahiSelectQuery.isLoading || heroQuery.isLoading;
  const ytLoadError =
    youtubeSectionsQuery.error instanceof Error ? youtubeSectionsQuery.error.message : "";
  const mahiLoadError =
    mahiSelectQuery.error instanceof Error ? mahiSelectQuery.error.message : "";
  const anyError = ytLoadError || mahiLoadError;

  // Initial skeleton loader
  if (isAnythingLoading && allHomepageCatalogue.length === 0) {
    return <HomepageSkeleton />;
  }

  return (
    <div className="relative">
      {/* HERO BANNER */}
      <div>
        {allHomepageCatalogue.length > 0 ? (
          <HeroBanner
            catalogue={allHomepageCatalogue}
            sections={sections}
            songsBySection={songsBySection}
            manualSongs={manualHeroSongs}
            autoRotate={heroSettings.rotation_enabled}
            intervalSeconds={heroSettings.rotation_interval_seconds || 5}
          />
        ) : isAnythingLoading ? (
          <HeroBannerSkeleton />
        ) : null}
      </div>

      {/* ERRORS */}
      {anyError && (
        <div className="px-3 py-2 sm:px-6 md:px-12">
          <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-400">
            {ytLoadError ? `YouTube: ${ytLoadError} ` : ""}
            {mahiLoadError ? `Local Library: ${mahiLoadError}` : ""}
          </p>
        </div>
      )}

      {/* ADAPTIVE HOMEPAGE SECTIONS */}
      <div className="space-y-6 pt-4 sm:space-y-8 sm:pt-6 lg:space-y-10">
        {/* 1. Quick Picks / Made For You Row */}
        {dedupedQuickPicks.length > 0 && (
          <SectionRow section={dynamicQuickPicksSection} songs={dedupedQuickPicks} />
        )}

        {/* 2. Resume Listening Capsule Bar (Directly below Quick Picks) */}
        <ResumeListeningSection />

        {/* 3. Prioritized Dynamic Category Rows (MEVO Pulse, Bengal Echo, etc.) */}
        {displayRows.map(({ section, songs }) => (
          <SectionRow key={section.id} section={section} songs={songs} />
        ))}

        {/* 4. Recently Played Fallback Row */}
        <RecentlyPlayedRow />
      </div>
    </div>
  );
}
