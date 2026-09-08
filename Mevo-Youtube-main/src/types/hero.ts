export type HeroMode = "automatic" | "manual" | "scheduled";
export type HeroPeriod = "day" | "night" | "override";

export interface HomeHeroSettings {
  id: string;
  mode: HeroMode;
  enabled: boolean;
  day_title: string;
  night_title: string;
  day_start_time: string; // e.g. "06:00"
  night_start_time: string; // e.g. "18:00"
  rotation_enabled: boolean;
  rotation_interval_seconds: number;
  manual_override_song_id: string | null;
  override_start_at: string | null;
  override_end_at: string | null;
  updated_at: string;
}

export interface HomeHeroSongRecord {
  id?: string;
  period: HeroPeriod;
  song_id: string;
  display_order: number;
  active: boolean;
  source_type: string;
  created_at?: string;
}

export const DEFAULT_HERO_SETTINGS: HomeHeroSettings = {
  id: "default",
  mode: "automatic",
  enabled: true,
  day_title: "Today's Pick",
  night_title: "Tonight's Pick",
  day_start_time: "06:00",
  night_start_time: "18:00",
  rotation_enabled: true,
  rotation_interval_seconds: 8,
  manual_override_song_id: null,
  override_start_at: null,
  override_end_at: null,
  updated_at: new Date().toISOString(),
};
