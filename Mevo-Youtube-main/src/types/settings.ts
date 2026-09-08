export type AppTheme = "dark" | "midnight" | "light";

export interface UserSettings {
  autoplay: boolean;
  crossfadeSeconds: number;
  gaplessPlayback: boolean;
  volumeNormalization: boolean;
  rememberPlaybackPosition: boolean;
  streamingQuality: "automatic" | "low" | "normal" | "high" | "original";
  downloadQuality: "normal" | "high" | "original";
  theme: AppTheme;
  accentColor: string;
  reduceMotion: boolean;
  compactPlayer: boolean;
  allowExplicitContent: boolean;
  showListeningActivity: boolean;
  privateSession: boolean;
  notificationsEnabled: boolean;
  language: "en" | "bn";
}

export const DEFAULT_SETTINGS: UserSettings = {
  autoplay: true,
  crossfadeSeconds: 0,
  gaplessPlayback: true,
  volumeNormalization: false,
  rememberPlaybackPosition: false,
  streamingQuality: "original",
  downloadQuality: "original",
  theme: "dark",
  accentColor: "#10b981",
  reduceMotion: false,
  compactPlayer: false,
  allowExplicitContent: true,
  showListeningActivity: true,
  privateSession: false,
  notificationsEnabled: false,
  language: "en",
};
