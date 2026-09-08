import { useEffect, useState } from "react";
import {
  Sparkles,
  Sun,
  Moon,
  Clock,
  RotateCw,
  Search,
  Check,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Play,
  Calendar,
  Save,
  AlertCircle,
} from "lucide-react";
import {
  getHeroSettings,
  updateHeroSettings,
  getHeroSongsRecords,
  setHeroSongsForPeriod,
} from "@/services/heroService";
import { DEFAULT_HERO_SETTINGS, type HomeHeroSettings, type HeroPeriod } from "@/types/hero";
import type { Song } from "@/services/songService";
import { databaseSongToPlayerSong } from "@/lib/song-adapter";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface HeroManagerPanelProps {
  allSongs: Song[];
  loading: boolean;
}

export function HeroManagerPanel({ allSongs, loading }: HeroManagerPanelProps) {
  const [settings, setSettings] = useState<HomeHeroSettings>(DEFAULT_HERO_SETTINGS);
  const [daySongIds, setDaySongIds] = useState<string[]>([]);
  const [nightSongIds, setNightSongIds] = useState<string[]>([]);
  const [activeSetTab, setActiveSetTab] = useState<"day" | "night">("day");
  const [searchQuery, setSearchQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewPeriod, setPreviewPeriod] = useState<"day" | "night" | "override">("day");

  useEffect(() => {
    async function loadData() {
      const heroConfig = await getHeroSettings();
      const dayIds = await getHeroSongsRecords("day");
      const nightIds = await getHeroSongsRecords("night");

      setSettings(heroConfig);
      setDaySongIds(dayIds);
      setNightSongIds(nightIds);
    }
    void loadData();
  }, []);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await updateHeroSettings(settings);
      await setHeroSongsForPeriod("day", daySongIds);
      await setHeroSongsForPeriod("night", nightSongIds);
      toast.success("Hero settings and song sets saved successfully!");
    } catch (err) {
      toast.error("Could not save hero settings.");
    } finally {
      setSaving(false);
    }
  };

  const activeSongIds = activeSetTab === "day" ? daySongIds : nightSongIds;
  const setActiveSongIds = (newIds: string[]) => {
    if (activeSetTab === "day") setDaySongIds(newIds);
    else setNightSongIds(newIds);
  };

  const handleAddSong = (songId: string) => {
    if (activeSongIds.length >= 5) {
      toast.error("Maximum 5 songs allowed per set.");
      return;
    }
    if (activeSongIds.includes(songId)) {
      toast.error("Song already selected in this set.");
      return;
    }
    setActiveSongIds([...activeSongIds, songId]);
  };

  const handleRemoveSong = (songId: string) => {
    setActiveSongIds(activeSongIds.filter((id) => id !== songId));
  };

  const handleMoveSong = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= activeSongIds.length) return;

    const list = [...activeSongIds];
    const [moved] = list.splice(index, 1);
    list.splice(targetIndex, 0, moved);
    setActiveSongIds(list);
  };

  // Filter songs for search selector (only published)
  const q = searchQuery.toLowerCase();
  const filteredSongs = allSongs.filter(
    (s) =>
      s.published &&
      s.audio_file &&
      ((s.title ?? "").toLowerCase().includes(q) || (s.artist ?? "").toLowerCase().includes(q)),
  );

  // Helper map to retrieve song objects
  const songMap = new Map(allSongs.map((s) => [s.id, s]));

  // Selected song objects for current tab
  const selectedSongs = activeSongIds.map((id) => songMap.get(id)).filter(Boolean) as Song[];

  // Live preview active song
  const previewSong = (() => {
    if (previewPeriod === "override" && settings.manual_override_song_id) {
      const s = songMap.get(settings.manual_override_song_id);
      if (s) return s;
    }
    const ids = previewPeriod === "day" ? daySongIds : nightSongIds;
    if (ids.length > 0 && songMap.has(ids[0])) {
      return songMap.get(ids[0])!;
    }
    return allSongs.find((s) => s.published) || null;
  })();

  const previewLabel =
    previewPeriod === "override"
      ? "Special Feature"
      : previewPeriod === "day"
        ? settings.day_title
        : settings.night_title;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-3xl border border-white/10 bg-[#0c1a12] p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-emerald-500/20 text-emerald-400">
            <Sparkles className="size-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Home Hero & Today's Pick Manager</h2>
            <p className="text-xs text-white/60">
              Configure dynamic day & night song recommendations, rotation, and schedule.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveSettings}
          disabled={saving}
          className="flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-2.5 text-xs font-extrabold text-black shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all hover:bg-emerald-400 disabled:opacity-50"
        >
          <Save className="size-4" />
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Settings Form & Selector (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* General Hero Config */}
          <div className="rounded-3xl border border-white/10 bg-[#0c1a12] p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-white/10 pb-3">
              <Clock className="size-4 text-emerald-400" /> Mode & Schedule Settings
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Hero Mode */}
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">
                  Recommendation Mode
                </label>
                <select
                  value={settings.mode}
                  onChange={(e) => setSettings({ ...settings, mode: e.target.value as any })}
                  className="w-full rounded-xl border border-white/10 bg-[#06140c] px-3 py-2 text-xs font-medium text-emerald-400 focus:outline-none"
                >
                  <option value="automatic">Automatic (Dynamic Ranking)</option>
                  <option value="manual">Manual (Curated Set)</option>
                  <option value="scheduled">Scheduled Override</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">
                  Hero Status
                </label>
                <select
                  value={settings.enabled ? "enabled" : "disabled"}
                  onChange={(e) =>
                    setSettings({ ...settings, enabled: e.target.value === "enabled" })
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#06140c] px-3 py-2 text-xs font-medium text-emerald-400 focus:outline-none"
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>

              {/* Day Title */}
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">
                  Day Label Title
                </label>
                <input
                  type="text"
                  value={settings.day_title}
                  onChange={(e) => setSettings({ ...settings, day_title: e.target.value })}
                  placeholder="Today's Pick"
                  className="w-full rounded-xl border border-white/10 bg-[#06140c] px-3 py-2 text-xs text-white placeholder-white/40 focus:outline-none"
                />
              </div>

              {/* Night Title */}
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">
                  Night Label Title
                </label>
                <input
                  type="text"
                  value={settings.night_title}
                  onChange={(e) => setSettings({ ...settings, night_title: e.target.value })}
                  placeholder="Tonight's Pick"
                  className="w-full rounded-xl border border-white/10 bg-[#06140c] px-3 py-2 text-xs text-white placeholder-white/40 focus:outline-none"
                />
              </div>

              {/* Day Start */}
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">
                  Day Start Time (06:00 AM)
                </label>
                <input
                  type="text"
                  value={settings.day_start_time}
                  onChange={(e) => setSettings({ ...settings, day_start_time: e.target.value })}
                  placeholder="06:00"
                  className="w-full rounded-xl border border-white/10 bg-[#06140c] px-3 py-2 text-xs font-mono text-white focus:outline-none"
                />
              </div>

              {/* Night Start */}
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">
                  Night Start Time (06:00 PM)
                </label>
                <input
                  type="text"
                  value={settings.night_start_time}
                  onChange={(e) => setSettings({ ...settings, night_start_time: e.target.value })}
                  placeholder="18:00"
                  className="w-full rounded-xl border border-white/10 bg-[#06140c] px-3 py-2 text-xs font-mono text-white focus:outline-none"
                />
              </div>
            </div>

            {/* Rotation Settings */}
            <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-4">
              <div>
                <span className="block text-xs font-bold text-white">Auto Rotation</span>
                <span className="block text-[11px] text-white/60">
                  Automatically slide through the 5 hero songs.
                </span>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={3}
                  max={30}
                  value={settings.rotation_interval_seconds}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      rotation_interval_seconds: Number(e.target.value),
                    })
                  }
                  className="w-16 rounded-xl border border-white/10 bg-[#06140c] px-2 py-1 text-center font-mono text-xs text-emerald-400 focus:outline-none"
                />
                <span className="text-xs text-white/60">sec</span>
              </div>
            </div>
          </div>

          {/* Manual Song Curator */}
          <div className="rounded-3xl border border-white/10 bg-[#0c1a12] p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <RotateCw className="size-4 text-emerald-400" /> Curated 5-Song Sets
              </h3>

              <div className="flex rounded-xl bg-[#06140c] p-1 border border-white/10">
                <button
                  type="button"
                  onClick={() => setActiveSetTab("day")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all",
                    activeSetTab === "day"
                      ? "bg-emerald-500 text-black shadow-md"
                      : "text-white/60 hover:text-white",
                  )}
                >
                  <Sun className="size-3.5" /> Day Set ({daySongIds.length}/5)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSetTab("night")}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all",
                    activeSetTab === "night"
                      ? "bg-emerald-500 text-black shadow-md"
                      : "text-white/60 hover:text-white",
                  )}
                >
                  <Moon className="size-3.5" /> Night Set ({nightSongIds.length}/5)
                </button>
              </div>
            </div>

            {/* Currently Selected Songs */}
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-white/60">
                Selected Songs for {activeSetTab === "day" ? "Day" : "Night"} Set (
                {selectedSongs.length} of 5):
              </span>

              {selectedSongs.length === 0 ? (
                <p className="py-4 text-center text-xs text-white/40 border border-dashed border-white/10 rounded-2xl">
                  No songs selected for this set. Select songs below.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {selectedSongs.map((song, index) => (
                    <div
                      key={song.id}
                      className="flex items-center justify-between rounded-2xl border border-white/10 bg-[#06140c] p-2"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1 pr-2">
                        <span className="w-5 font-mono text-xs font-bold text-emerald-400 shrink-0 text-center">
                          0{index + 1}
                        </span>
                        <img
                          src={song.cover_image || "/placeholder.svg"}
                          alt=""
                          className="size-10 rounded-lg object-cover border border-white/10 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <h4 className="truncate text-xs font-bold text-white">
                            {song.title ?? ""}
                          </h4>
                          <p className="truncate text-[11px] text-white/60">{song.artist ?? ""}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => handleMoveSong(index, "up")}
                          className="grid size-7 place-items-center rounded-lg text-white/60 hover:text-white disabled:opacity-30"
                        >
                          <ChevronUp className="size-4" />
                        </button>
                        <button
                          type="button"
                          disabled={index === selectedSongs.length - 1}
                          onClick={() => handleMoveSong(index, "down")}
                          className="grid size-7 place-items-center rounded-lg text-white/60 hover:text-white disabled:opacity-30"
                        >
                          <ChevronDown className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveSong(song.id)}
                          className="grid size-7 place-items-center rounded-lg text-red-400 hover:bg-red-500/10"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Song Search Selector */}
            <div className="pt-3 border-t border-white/10 space-y-3">
              <span className="block text-xs font-semibold text-white/70">
                Search & Add Published Songs:
              </span>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by song title or artist..."
                  className="w-full rounded-2xl border border-white/10 bg-[#06140c] py-2.5 pl-9 pr-4 text-xs text-white placeholder-white/40 focus:outline-none"
                />
              </div>

              <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                {filteredSongs.slice(0, 10).map((song) => {
                  const selected = activeSongIds.includes(song.id);
                  return (
                    <div
                      key={song.id}
                      className="flex items-center justify-between rounded-xl p-2 hover:bg-white/[0.04] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                        <img
                          src={song.cover_image || "/placeholder.svg"}
                          alt=""
                          className="size-9 rounded-lg object-cover border border-white/10 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <h5 className="truncate text-xs font-bold text-white">
                            {song.title ?? ""}
                          </h5>
                          <p className="truncate text-[11px] text-white/60">{song.artist ?? ""}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={selected || activeSongIds.length >= 5}
                        onClick={() => handleAddSong(song.id)}
                        className={cn(
                          "flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-bold transition-all shrink-0",
                          selected
                            ? "bg-emerald-500/20 text-emerald-400 cursor-default"
                            : "bg-emerald-500 text-black hover:bg-emerald-400 disabled:opacity-40",
                        )}
                      >
                        {selected ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                        {selected ? "Selected" : "Add"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Manual Override Schedule */}
          <div className="rounded-3xl border border-white/10 bg-[#0c1a12] p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-white/10 pb-3">
              <Calendar className="size-4 text-emerald-400" /> Temporary Scheduled Override
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">
                  Pinned Override Song
                </label>
                <select
                  value={settings.manual_override_song_id || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      manual_override_song_id: e.target.value || null,
                    })
                  }
                  className="w-full rounded-xl border border-white/10 bg-[#06140c] px-3 py-2 text-xs font-medium text-emerald-400 focus:outline-none"
                >
                  <option value="">None (Disabled)</option>
                  {allSongs
                    .filter((s) => s.published)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title ?? ""} — {s.artist ?? ""}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-white/70 mb-1">
                    Start ISO Date/Time
                  </label>
                  <input
                    type="datetime-local"
                    value={
                      settings.override_start_at
                        ? new Date(settings.override_start_at).toISOString().slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        override_start_at: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      })
                    }
                    className="w-full rounded-xl border border-white/10 bg-[#06140c] px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-white/70 mb-1">
                    End ISO Date/Time
                  </label>
                  <input
                    type="datetime-local"
                    value={
                      settings.override_end_at
                        ? new Date(settings.override_end_at).toISOString().slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        override_end_at: e.target.value
                          ? new Date(e.target.value).toISOString()
                          : null,
                      })
                    }
                    className="w-full rounded-xl border border-white/10 bg-[#06140c] px-3 py-2 text-xs text-white focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Live Mobile Preview Card (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="sticky top-6 rounded-3xl border border-emerald-500/30 bg-[#0c1811] p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="size-4 text-emerald-400" /> Live Mobile Hero Preview
              </h3>

              <div className="flex rounded-xl bg-[#06140c] p-1 border border-white/10">
                <button
                  type="button"
                  onClick={() => setPreviewPeriod("day")}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all",
                    previewPeriod === "day"
                      ? "bg-emerald-500 text-black"
                      : "text-white/60 hover:text-white",
                  )}
                >
                  Day
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewPeriod("night")}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all",
                    previewPeriod === "night"
                      ? "bg-emerald-500 text-black"
                      : "text-white/60 hover:text-white",
                  )}
                >
                  Night
                </button>
              </div>
            </div>

            {/* Live Hero Card Box */}
            <div className="relative overflow-hidden rounded-3xl border border-white/10 p-5 min-h-[190px] flex flex-col justify-between shadow-2xl">
              {previewSong ? (
                <>
                  <img
                    src={previewSong.cover_image || "/placeholder.svg"}
                    alt=""
                    className="absolute inset-0 size-full object-cover object-center -z-10"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-[#06140c]/95 via-[#06140c]/80 to-transparent -z-10" />

                  <div>
                    <span className="text-[10px] font-extrabold tracking-[0.2em] uppercase text-emerald-400">
                      {previewLabel}
                    </span>
                    <h3 className="text-2xl font-extrabold text-white mt-1 line-clamp-1">
                      {previewSong.title ?? ""}
                    </h3>
                    <p className="text-xs text-white/70 font-medium mt-0.5">
                      {previewSong.artist ?? ""}
                    </p>

                    <div className="mt-4 flex items-center gap-3">
                      <div className="flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-xs font-extrabold text-black">
                        <Play className="size-3.5 fill-current" /> Play Now
                      </div>
                      <div className="grid size-8 place-items-center rounded-full bg-white/10 text-white backdrop-blur-md">
                        <Play className="size-3.5 text-white" />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-1.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span
                        key={i}
                        className={cn(
                          "rounded-full transition-all duration-300",
                          i === 0 ? "w-4 bg-emerald-400 h-1.5" : "w-1.5 bg-white/30 h-1.5",
                        )}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-xs text-white/40">
                  No preview song available.
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-emerald-950/30 border border-emerald-500/20 p-3 text-[11px] text-white/70 space-y-1">
              <p className="font-bold text-emerald-400 flex items-center gap-1.5">
                <AlertCircle className="size-3.5" /> Realtime Sync Active
              </p>
              <p>
                Changes saved here sync immediately across all connected browsers and devices
                without page refreshes.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
