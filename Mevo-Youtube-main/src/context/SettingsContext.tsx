import React, { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_SETTINGS, type UserSettings, type AppTheme } from "@/types/settings";
import { clearListeningHistory as clearServiceListeningHistory } from "@/services/listeningHistoryService";
import { toast } from "sonner";

export type ResolvedTheme = "dark" | "midnight" | "light";

interface SettingsContextType {
  settings: UserSettings;
  resolvedTheme: ResolvedTheme;
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  resetSettings: () => void;
  clearHistory: () => void;
  clearSearchHistory: () => void;
  clearPlaybackPositions: () => void;
  requestNotificationPermission: () => Promise<void>;
}

const STORAGE_KEY = "mevo-user-settings";
const RECENTLY_PLAYED_KEY = "mevo-recently-played";
const SEARCH_HISTORY_KEY = "mevo-search-history";
const PLAYBACK_POSITIONS_KEY = "mevo-playback-positions";

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<UserSettings>(() => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const appLanguage = localStorage.getItem("app_language") as "en" | "bn" | null;
      if (!saved) {
        return {
          ...DEFAULT_SETTINGS,
          ...(appLanguage && ["en", "bn"].includes(appLanguage) ? { language: appLanguage } : {}),
        };
      }
      const parsed = JSON.parse(saved);
      // Migrate / fallback any old "system" or invalid theme to "dark" (Dark Emerald)
      if (parsed.theme === "system" || !["dark", "midnight", "light"].includes(parsed.theme)) {
        parsed.theme = "dark";
      }
      if (appLanguage && ["en", "bn"].includes(appLanguage)) {
        parsed.language = appLanguage;
      }
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Active theme is directly settings.theme with "dark" fallback
  const resolvedTheme: ResolvedTheme =
    settings.theme === "midnight" || settings.theme === "light" ? settings.theme : "dark";

  // Dynamically apply data-theme and classes to root <html> and <body>
  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const body = document.body;

    root.setAttribute("data-theme", resolvedTheme);
    body.setAttribute("data-theme", resolvedTheme);

    // Sync classList for Tailwind color mode compatibility
    if (resolvedTheme === "light") {
      root.classList.remove("dark", "midnight");
      root.classList.add("light");
      body.classList.remove("dark", "midnight");
      body.classList.add("light");
    } else if (resolvedTheme === "midnight") {
      root.classList.remove("light");
      root.classList.add("dark", "midnight");
      body.classList.remove("light");
      body.classList.add("dark", "midnight");
    } else {
      // Dark Emerald default
      root.classList.remove("light", "midnight");
      root.classList.add("dark");
      body.classList.remove("light", "midnight");
      body.classList.add("dark");
    }

    // Sync reduce-motion state
    if (settings.reduceMotion) {
      root.classList.add("reduce-motion");
      body.classList.add("reduce-motion");
    } else {
      root.classList.remove("reduce-motion");
      body.classList.remove("reduce-motion");
    }
  }, [resolvedTheme, settings.reduceMotion]);

  // Persist settings to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      if (settings.language) {
        localStorage.setItem("app_language", settings.language);
      }
    } catch (e) {
      console.error("Could not save settings:", e);
    }
  }, [settings]);

  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    toast.success("Settings reset to defaults.");
  };

  const clearHistory = () => {
    try {
      localStorage.removeItem(RECENTLY_PLAYED_KEY);
      clearServiceListeningHistory();
      toast.success("Listening history cleared.");
    } catch (e) {
      toast.error("Could not clear listening history.");
    }
  };

  const clearSearchHistory = () => {
    try {
      localStorage.removeItem(SEARCH_HISTORY_KEY);
      toast.success("Search history cleared.");
    } catch (e) {
      toast.error("Could not clear search history.");
    }
  };

  const clearPlaybackPositions = () => {
    try {
      localStorage.removeItem(PLAYBACK_POSITIONS_KEY);
      toast.success("Playback positions cleared.");
    } catch (e) {
      toast.error("Could not clear playback positions.");
    }
  };

  const requestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Notifications are not supported by your browser.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        updateSetting("notificationsEnabled", true);
        toast.success("Notifications enabled!");
      } else {
        updateSetting("notificationsEnabled", false);
        toast("Notification permission denied.");
      }
    } catch (err) {
      toast.error("Could not request notification permission.");
    }
  };

  return (
    <SettingsContext.Provider
      value={{
        settings,
        resolvedTheme,
        updateSetting,
        resetSettings,
        clearHistory,
        clearSearchHistory,
        clearPlaybackPositions,
        requestNotificationPermission,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return ctx;
}
