import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  sections as defaultSections,
  belongsToSection,
  type Section,
  type Song,
} from "@/data/songs";
import { usePlayer } from "@/lib/player-context";
import { preloadImage } from "@/lib/image-preloader";

export type TimeSlot = 0 | 1 | 2;

export interface TimeSlotInfo {
  slot: TimeSlot;
  label: "MORNING VIBES" | "TODAY'S PICK" | "TONIGHT'S PICK";
  daysPassed: number;
  totalShifts: number;
}

const BDT_OFFSET_MS = 6 * 60 * 60 * 1000; // GMT+6 in milliseconds

/**
 * Calculates current time slot and shift count based on GMT+6 (Bangladesh Time):
 * - Morning (05:00 AM - 11:59 AM): "MORNING VIBES" (Slot 0)
 * - Afternoon (12:00 PM - 04:59 PM): "TODAY'S PICK" (Slot 1)
 * - Night (05:00 PM - 04:59 AM): "TONIGHT'S PICK" (Slot 2)
 *
 * Monotonic shift count: totalShifts = (daysPassed * 3) + slotIndex
 */
export function getTimeSlotInfo(nowMs: number = Date.now()): TimeSlotInfo {
  const bdtDate = new Date(nowMs + BDT_OFFSET_MS);
  const bdtHours = bdtDate.getUTCHours();

  let slot: TimeSlot = 0;
  let label: TimeSlotInfo["label"] = "MORNING VIBES";

  if (bdtHours >= 5 && bdtHours < 12) {
    slot = 0;
    label = "MORNING VIBES";
  } else if (bdtHours >= 12 && bdtHours < 17) {
    slot = 1;
    label = "TODAY'S PICK";
  } else {
    slot = 2;
    label = "TONIGHT'S PICK";
  }

  // Rotation day starts at 05:00 AM BDT (+6h - 5h = +1h from UTC)
  const daysPassed = Math.floor((nowMs + 1 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000));
  const totalShifts = daysPassed * 3 + slot;

  return {
    slot,
    label,
    daysPassed,
    totalShifts,
  };
}

/**
 * Sorts songs within a section by latest upload time (created_at DESC / release_date DESC / id DESC).
 */
export function sortSectionSongsByLatest(songsList: readonly Song[]): Song[] {
  return [...songsList].sort((a, b) => {
    const dateA = a.created_at || a.release_date || "";
    const dateB = b.created_at || b.release_date || "";
    const timeA = dateA ? Date.parse(dateA) : 0;
    const timeB = dateB ? Date.parse(dateB) : 0;

    if (timeB !== timeA && !Number.isNaN(timeA) && !Number.isNaN(timeB)) {
      return timeB - timeA;
    }

    return b.id.localeCompare(a.id);
  });
}

export interface SectionSongPick {
  sectionId: string;
  sectionTitle: string;
  song: Song;
  targetIndex: number;
  totalSongsInSection: number;
}

/**
 * Picks exactly ONE song from EACH available section using the monotonic formula:
 * targetIndex = totalShifts % section.songs.length
 */
export function pickSongsFromSections(
  allSections: readonly Section[],
  songsBySection: Record<string, Song[]>,
  slotInfo: TimeSlotInfo,
): { songs: Song[]; picks: SectionSongPick[] } {
  const songs: Song[] = [];
  const picks: SectionSongPick[] = [];

  for (const section of allSections) {
    const rawList = songsBySection[section.id] ?? [];
    if (rawList.length === 0) continue;

    const sortedList = sortSectionSongsByLatest(rawList);
    const targetIndex = slotInfo.totalShifts % sortedList.length;
    const pickedSong = sortedList[targetIndex] || sortedList[0];

    if (pickedSong) {
      songs.push(pickedSong);
      picks.push({
        sectionId: section.id,
        sectionTitle: section.title,
        song: pickedSong,
        targetIndex,
        totalSongsInSection: sortedList.length,
      });
    }
  }

  return { songs, picks };
}

export interface UseSmartMusicDashboardOptions {
  catalogue?: Song[];
  sections?: Section[];
  songsBySection?: Record<string, Song[]>;
  manualSongs?: Song[];
  slideIntervalSeconds?: number;
  autoRotate?: boolean;
  labelOverride?: string;
}

export interface UseSmartMusicDashboardResult {
  currentSong: Song | null;
  songs: Song[];
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  nextSlide: () => void;
  prevSlide: () => void;
  slotInfo: TimeSlotInfo;
  headerLabel: string;
  sectionPicks: SectionSongPick[];
  isPlayingNow: boolean;
  handlePlayNow: () => void;
  isHovered: boolean;
  setIsHovered: (hovered: boolean) => void;
  containerProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchEnd: (e: React.TouchEvent) => void;
  };
}

/**
 * Production-ready custom hook for the MEVO featured dashboard banner.
 * - Multi-section guarantee: Picks exactly 1 song from each available section.
 * - 3-shift daily rotation based on GMT+6 Bangladesh Time (Morning, Afternoon, Night).
 * - Monotonic non-repeating queue with modulo cyclic fallback.
 * - 5-second slide rotation with epoch synchronization and pause-on-hover/touch/playback.
 * - Full manual override support.
 */
export function useSmartMusicDashboard(
  options: UseSmartMusicDashboardOptions = {},
): UseSmartMusicDashboardResult {
  const {
    catalogue = [],
    sections = defaultSections,
    songsBySection: customSongsBySection,
    manualSongs,
    slideIntervalSeconds = 5,
    autoRotate = true,
    labelOverride,
  } = options;

  const player = usePlayer();
  const [slotInfo, setSlotInfo] = useState<TimeSlotInfo>(() => getTimeSlotInfo());
  const [userInteractedIndex, setUserInteractedIndex] = useState<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const touchStartX = useRef<number | null>(null);

  // Periodically refresh time slot info every 30 seconds
  useEffect(() => {
    const updateSlot = () => setSlotInfo(getTimeSlotInfo());
    updateSlot();
    const timer = setInterval(updateSlot, 30000);
    return () => clearInterval(timer);
  }, []);

  // Group catalogue songs by section if not provided
  const songsBySection = useMemo(() => {
    if (customSongsBySection) return customSongsBySection;

    const map: Record<string, Song[]> = {};
    for (const sec of sections) {
      map[sec.id] = [];
    }

    for (const song of catalogue) {
      for (const sec of sections) {
        if (belongsToSection(song, sec.id as any)) {
          if (!map[sec.id]) map[sec.id] = [];
          map[sec.id].push(song);
        }
      }
    }

    return map;
  }, [catalogue, sections, customSongsBySection]);

  // Compute dashboard songs (manual override vs. multi-section auto picks)
  const { songs, picks: sectionPicks } = useMemo(() => {
    if (manualSongs && manualSongs.length > 0) {
      return {
        songs: manualSongs,
        picks: [],
      };
    }

    return pickSongsFromSections(sections, songsBySection, slotInfo);
  }, [manualSongs, sections, songsBySection, slotInfo]);

  const totalSongs = songs.length;

  // Synchronized active index: global epoch 5-second interval unless user manually interacted
  const [epochIndex, setEpochIndex] = useState(0);

  useEffect(() => {
    if (totalSongs <= 1 || !autoRotate || isHovered) return;

    const updateEpochIndex = () => {
      const globalTick = Math.floor(Date.now() / 1000 / (slideIntervalSeconds || 5));
      setEpochIndex(globalTick % totalSongs);
    };

    updateEpochIndex();
    const interval = setInterval(updateEpochIndex, 1000);
    return () => clearInterval(interval);
  }, [totalSongs, autoRotate, isHovered, slideIntervalSeconds]);

  // Resolve active index (respect manual interaction or epoch-sync)
  const activeIndex = useMemo(() => {
    if (totalSongs === 0) return 0;
    if (userInteractedIndex !== null) {
      return Math.min(Math.max(userInteractedIndex, 0), totalSongs - 1);
    }
    return epochIndex % totalSongs;
  }, [totalSongs, userInteractedIndex, epochIndex]);

  const currentSong = songs[activeIndex] || songs[0] || null;

  // Preload upcoming cover image
  useEffect(() => {
    if (totalSongs > 1) {
      const nextIdx = (activeIndex + 1) % totalSongs;
      const nextSong = songs[nextIdx];
      if (nextSong?.cover) {
        preloadImage(nextSong.cover);
      }
    }
  }, [activeIndex, totalSongs, songs]);

  const isCurrent = Boolean(currentSong && player.current?.id === currentSong.id);
  const isPlayingNow = isCurrent && player.isPlaying;

  const headerLabel = labelOverride || slotInfo.label;

  const setActiveIndex = useCallback((index: number) => {
    setUserInteractedIndex(index);
  }, []);

  const nextSlide = useCallback(() => {
    if (totalSongs <= 1) return;
    setUserInteractedIndex((prev) => ((prev ?? activeIndex) + 1) % totalSongs);
  }, [totalSongs, activeIndex]);

  const prevSlide = useCallback(() => {
    if (totalSongs <= 1) return;
    setUserInteractedIndex((prev) => ((prev ?? activeIndex) - 1 + totalSongs) % totalSongs);
  }, [totalSongs, activeIndex]);

  const handlePlayNow = useCallback(() => {
    if (!currentSong) return;

    if (isCurrent) {
      player.toggle();
      return;
    }

    const queueSource = {
      type: "hero" as const,
      id: "dashboard-pick",
      title: headerLabel,
    };

    const navigationSource = {
      ...queueSource,
      pathname: "/",
      label: headerLabel,
    };

    player.playFromCollection(songs, activeIndex, queueSource, navigationSource);
  }, [currentSong, isCurrent, player, headerLabel, songs, activeIndex]);

  // Touch Swipe Gesture Handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diffX = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diffX) > 40) {
      if (diffX < 0) {
        nextSlide();
      } else {
        prevSlide();
      }
    }
    touchStartX.current = null;
  };

  return {
    currentSong,
    songs,
    activeIndex,
    setActiveIndex,
    nextSlide,
    prevSlide,
    slotInfo,
    headerLabel,
    sectionPicks,
    isPlayingNow,
    handlePlayNow,
    isHovered,
    setIsHovered,
    containerProps: {
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
      onTouchStart: handleTouchStart,
      onTouchEnd: handleTouchEnd,
    },
  };
}
