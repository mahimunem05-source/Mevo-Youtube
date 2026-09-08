import { useCallback } from "react";
import { useSettings } from "@/context/SettingsContext";
import { getTranslation, type Language } from "@/lib/i18n";

export function useTranslation() {
  const { settings, updateSetting } = useSettings();
  const language: Language = settings.language || "en";

  const t = useCallback(
    (key: string, fallback?: string): string => {
      const val = getTranslation(key, language);
      return val !== key ? val : (fallback ?? key);
    },
    [language],
  );

  const setLanguage = useCallback(
    (nextLang: Language) => {
      updateSetting("language", nextLang);
      try {
        localStorage.setItem("app_language", nextLang);
      } catch {
        /* ignore */
      }
    },
    [updateSetting],
  );

  return { t, language, setLanguage };
}
