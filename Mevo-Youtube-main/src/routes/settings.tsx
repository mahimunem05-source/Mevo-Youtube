import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Sliders, Music, HardDrive, Palette, Globe, UserCheck, Info, Trash2 } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useDownloads } from "@/hooks/useDownloads";
import { useTranslation } from "@/hooks/useTranslation";
import { PageHeader } from "@/components/music/page-header";
import { SettingSection } from "@/components/settings/SettingSection";
import { SettingToggle } from "@/components/settings/SettingToggle";
import { SettingSelect } from "@/components/settings/SettingSelect";
import { SettingSlider } from "@/components/settings/SettingSlider";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — MEVO" },
      { name: "description", content: "Customize your MEVO playback and app preferences." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { settings, updateSetting } = useSettings();
  const { t, setLanguage } = useTranslation();
  const { downloadedTracks, totalStorageFormatted, clearAllDownloads } = useDownloads();

  const [confirmDialogState, setConfirmDialogState] = useState<{
    open: boolean;
    title: string;
    description: string;
    action: () => void;
  }>({
    open: false,
    title: "",
    description: "",
    action: () => {},
  });

  const openConfirm = (title: string, description: string, action: () => void) => {
    setConfirmDialogState({ open: true, title, description, action });
  };

  return (
    <div className="pb-36 pt-2 px-4 sm:px-6 md:px-12 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        eyebrow={t("settings.eyebrow")}
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
      />

      {/* 1. PLAYBACK SECTION */}
      <SettingSection
        title={t("settings.playback.title")}
        description={t("settings.playback.desc")}
        icon={<Sliders className="size-5" />}
      >
        <SettingToggle
          label={t("settings.autoplay.label")}
          description={t("settings.autoplay.desc")}
          checked={settings.autoplay}
          onChange={(val) => updateSetting("autoplay", val)}
        />
        <SettingSlider
          label={t("settings.crossfade.label")}
          description={t("settings.crossfade.desc")}
          value={settings.crossfadeSeconds}
          min={0}
          max={12}
          step={1}
          unit="s"
          onChange={(val) => updateSetting("crossfadeSeconds", val)}
        />
      </SettingSection>

      {/* 2. AUDIO QUALITY SECTION */}
      <SettingSection
        title={t("settings.audioQuality.title")}
        description={t("settings.audioQuality.desc")}
        icon={<Music className="size-5" />}
      >
        <SettingSelect
          label={t("settings.streamingQuality.label")}
          description={t("settings.streamingQuality.desc")}
          value={settings.streamingQuality}
          options={[
            { value: "original", label: "Original (Studio)" },
            { value: "high", label: "High (320 kbps)" },
            { value: "normal", label: "Normal (160 kbps)" },
            { value: "low", label: "Low (96 kbps)" },
            { value: "automatic", label: "Automatic" },
          ]}
          onChange={(val: any) => updateSetting("streamingQuality", val)}
        />
        <SettingSelect
          label={t("settings.downloadQuality.label")}
          description={t("settings.downloadQuality.desc")}
          value={settings.downloadQuality}
          options={[
            { value: "original", label: "Original (Uncompressed)" },
            { value: "high", label: "High" },
            { value: "normal", label: "Normal" },
          ]}
          onChange={(val: any) => updateSetting("downloadQuality", val)}
        />
      </SettingSection>

      {/* 3. STORAGE & DOWNLOADS SECTION */}
      <SettingSection
        title={t("settings.storage.title")}
        description={`Using ${totalStorageFormatted} for ${downloadedTracks.length} offline tracks.`}
        icon={<HardDrive className="size-5" />}
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 py-1">
          <div>
            <span className="block text-xs sm:text-sm font-semibold text-white">
              {t("settings.storageUsed")}
            </span>
            <span className="block text-xs text-emerald-400 mt-0.5 font-bold">
              {totalStorageFormatted} • {downloadedTracks.length} songs downloaded
            </span>
          </div>
          <button
            type="button"
            onClick={() =>
              openConfirm(
                "Delete All Downloads?",
                "Delete all offline downloaded music from your device storage?",
                () => void clearAllDownloads(),
              )
            }
            className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 transition-colors shrink-0 cursor-pointer"
          >
            <Trash2 className="size-3.5" /> {t("settings.clearDownloads")}
          </button>
        </div>
      </SettingSection>

      {/* 4. APPEARANCE SECTION */}
      <SettingSection
        title={t("settings.appearance.title")}
        description={t("settings.appearance.desc")}
        icon={<Palette className="size-5" />}
      >
        <SettingSelect
          label={t("settings.theme.label")}
          value={settings.theme}
          options={[
            { value: "dark", label: t("settings.theme.dark") },
            { value: "midnight", label: t("settings.theme.midnight") },
            { value: "light", label: t("settings.theme.light") },
          ]}
          onChange={(val: any) => updateSetting("theme", val)}
        />
        <SettingToggle
          label={t("settings.reduceMotion.label")}
          description={t("settings.reduceMotion.desc")}
          checked={settings.reduceMotion}
          onChange={(val) => updateSetting("reduceMotion", val)}
        />
        <SettingToggle
          label={t("settings.compactPlayer.label")}
          description={t("settings.compactPlayer.desc")}
          checked={settings.compactPlayer}
          onChange={(val) => updateSetting("compactPlayer", val)}
        />
      </SettingSection>

      {/* 5. LANGUAGE SECTION */}
      <SettingSection
        title={t("settings.language.title")}
        description={t("settings.language.desc")}
        icon={<Globe className="size-5" />}
      >
        <SettingSelect
          label={t("settings.appLanguage.label")}
          value={settings.language}
          options={[
            { value: "en", label: "English" },
            { value: "bn", label: "বাংলা (Bengali)" },
          ]}
          onChange={(val: any) => {
            setLanguage(val);
            toast.success(`Language set to ${val === "bn" ? "বাংলা" : "English"}`);
          }}
        />
      </SettingSection>

      {/* 6. ACCOUNT SECTION */}
      <SettingSection
        title="Account"
        description="Guest listening mode"
        icon={<UserCheck className="size-5" />}
      >
        <div className="rounded-2xl border border-[#4FD1C5]/20 bg-[#182227]/40 p-4">
          <h3 className="text-xs font-bold text-teal-400">Guest Listening Mode</h3>
          <p className="text-xs text-white/70 mt-1 leading-relaxed">
            Your downloads, custom collections, and settings are securely stored locally on this
            device.
          </p>
        </div>
      </SettingSection>

      {/* 7. ABOUT SECTION */}
      <SettingSection
        title={t("settings.aboutMevo")}
        description="App info, policies and support."
        icon={<Info className="size-5" />}
      >
        <div className="flex items-center justify-between text-xs py-1">
          <span className="text-white/70">MEVO Version</span>
          <span className="font-mono font-bold text-teal-400">v2.4.0 (Pure Stream)</span>
        </div>
        <div className="flex flex-wrap gap-4 text-xs pt-2 border-t border-white/[0.06]">
          <Link to="/privacy" className="text-teal-400 hover:underline">
            {t("settings.privacy")}
          </Link>
          <Link to="/terms" className="text-teal-400 hover:underline">
            {t("settings.terms")}
          </Link>
          <Link to="/support" className="text-teal-400 hover:underline">
            {t("settings.contact")}
          </Link>
        </div>
      </SettingSection>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        open={confirmDialogState.open}
        title={confirmDialogState.title}
        description={confirmDialogState.description}
        onConfirm={() => {
          confirmDialogState.action();
          setConfirmDialogState((prev) => ({ ...prev, open: false }));
        }}
        onCancel={() => setConfirmDialogState((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
