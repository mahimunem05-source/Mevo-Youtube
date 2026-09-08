import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { subscribeToRealtimeChanges } from "@/lib/realtime-helper";
import { Button } from "@/components/ui/button";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { getAllSongs, getTrendingSongIds, type Song } from "@/services/songService";

import { QuickUploadPanel } from "./upload/QuickUploadPanel";
import { BatchUploadPanel } from "./upload/BatchUploadPanel";
import { YouTubeImportPanel } from "./upload/YouTubeImportPanel";
import { SongManagerPanel } from "./SongManagerPanel";
import { ArtistManagerPanel } from "./artists/ArtistManagerPanel";
import { MahiEditionManager } from "./albums/MahiEditionManager";
import { HeroManagerPanel } from "./hero/HeroManagerPanel";
import { DeviceWhitelistManager } from "./DeviceWhitelistManager";
import { DownloadRequestsManager } from "./DownloadRequestsManager";
import { Youtube, ShieldCheck } from "lucide-react";

interface AdminDashboardProps {
  onLogout: () => void;
}

interface SongPlayRow {
  play_count: number | null;
}

export function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [totalSongs, setTotalSongs] = useState(0);
  const [totalPlays, setTotalPlays] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");

  const [logoutLoading, setLogoutLoading] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const [songs, setSongs] = useState<Song[]>([]);
  const [trendingIds, setTrendingIds] = useState<string[]>([]);
  const [songsLoading, setSongsLoading] = useState(true);
  const [songsError, setSongsError] = useState("");

  const [activeTab, setActiveTab] = useState("quick");
  const [focusSongId, setFocusSongId] = useState<string | null>(null);

  const loadDashboardStats = useCallback(async () => {
    setStatsLoading(true);
    setStatsError("");

    try {
      const { count, error: countError } = await supabase
        .from("songs")
        .select("*", { count: "exact", head: true });

      if (countError) {
        throw new Error(`Could not load total songs: ${countError.message}`);
      }

      const { data: playRows, error: playsError } = await supabase
        .from("songs")
        .select("play_count");

      if (playsError) {
        throw new Error(`Could not load total plays: ${playsError.message}`);
      }

      const calculatedTotalPlays = ((playRows ?? []) as SongPlayRow[]).reduce(
        (total, song) => total + Number(song.play_count ?? 0),
        0,
      );

      setTotalSongs(count ?? 0);
      setTotalPlays(calculatedTotalPlays);
    } catch (error) {
      console.error("Dashboard stats error:", error);

      setStatsError(
        error instanceof Error ? error.message : "Failed to load dashboard statistics.",
      );
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadSongManagement = useCallback(async () => {
    setSongsLoading(true);
    setSongsError("");

    try {
      const [allSongs, trending] = await Promise.all([getAllSongs(), getTrendingSongIds()]);

      setSongs(allSongs);
      setTrendingIds(trending);
    } catch (error) {
      console.error("Song management load error:", error);

      setSongsError(
        error instanceof Error ? error.message : "Failed to load songs for management.",
      );
    } finally {
      setSongsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboardStats();
    void loadSongManagement();
  }, [loadDashboardStats, loadSongManagement]);

  useEffect(() => {
    return subscribeToRealtimeChanges("admin-dashboard-song-management", [
      {
        table: "songs",
        callback: () => {
          void loadDashboardStats();
          void loadSongManagement();
        },
      },
      {
        table: "trending_songs",
        callback: () => {
          void loadSongManagement();
        },
      },
    ]);
  }, [loadDashboardStats, loadSongManagement]);

  async function handleLogout() {
    setLogoutLoading(true);
    setLogoutError("");

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw new Error(error.message);
      }

      onLogout();
    } catch (error) {
      console.error("Logout error:", error);

      setLogoutError(error instanceof Error ? error.message : "Logout failed.");
    } finally {
      setLogoutLoading(false);
    }
  }

  function handleRefresh() {
    void loadDashboardStats();
    void loadSongManagement();
  }

  function handleManageSong(songId: string) {
    setFocusSongId(songId);
    setActiveTab("manage");
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">MEVO Admin Dashboard</h1>

          <p className="mt-1 text-sm text-muted-foreground">Upload and manage music content.</p>
        </div>

        <Button type="button" variant="destructive" onClick={handleLogout} disabled={logoutLoading}>
          {logoutLoading ? "Logging out..." : "Logout"}
        </Button>
      </div>

      {logoutError && (
        <p className="mb-5 text-sm text-red-500" role="alert">
          {logoutError}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total Songs</CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-3xl font-bold">{statsLoading ? "..." : totalSongs}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Plays</CardTitle>
          </CardHeader>

          <CardContent>
            <p className="text-3xl font-bold">
              {statsLoading ? "..." : totalPlays.toLocaleString()}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upload Status</CardTitle>
          </CardHeader>

          <CardContent>
            <p className={statsError ? "font-medium text-red-500" : "font-medium text-green-500"}>
              {statsLoading ? "Loading..." : statsError ? "Database Error" : "Ready"}
            </p>
          </CardContent>
        </Card>
      </div>

      {statsError && (
        <div className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-sm text-red-500">{statsError}</p>

          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => void loadDashboardStats()}
            disabled={statsLoading}
          >
            Retry
          </Button>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-8">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="quick">Quick Upload</TabsTrigger>
          <TabsTrigger value="batch">Batch Upload</TabsTrigger>
          <TabsTrigger value="youtube" className="flex items-center gap-1.5 text-red-500 hover:text-red-400">
            <Youtube className="size-4" /> YouTube Import
          </TabsTrigger>
          <TabsTrigger value="manage">Manage Songs</TabsTrigger>
          <TabsTrigger value="artists">Artists</TabsTrigger>
          <TabsTrigger value="albums">Albums</TabsTrigger>
          <TabsTrigger value="hero">Hero / Today's Pick</TabsTrigger>
          <TabsTrigger value="downloads" className="flex items-center gap-1.5 text-teal-400 hover:text-teal-300">
            <ShieldCheck className="size-4" /> Downloads
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quick" className="mt-6">
          <QuickUploadPanel onPublished={handleRefresh} onManageSong={handleManageSong} />
        </TabsContent>

        <TabsContent value="batch" className="mt-6">
          <BatchUploadPanel onPublished={handleRefresh} onManageSong={handleManageSong} />
        </TabsContent>

        <TabsContent value="youtube" className="mt-6">
          <YouTubeImportPanel onPublished={handleRefresh} onManageSong={handleManageSong} />
        </TabsContent>

        <TabsContent value="manage" className="mt-6">
          <SongManagerPanel
            songs={songs}
            trendingIds={trendingIds}
            loading={songsLoading}
            error={songsError}
            focusSongId={focusSongId}
            onRefresh={handleRefresh}
            onFocusHandled={() => setFocusSongId(null)}
          />
        </TabsContent>

        <TabsContent value="artists" className="mt-6">
          <ArtistManagerPanel songs={songs} loading={songsLoading} />
        </TabsContent>

        <TabsContent value="albums" className="mt-6">
          <MahiEditionManager songs={songs} loading={songsLoading} error={songsError} />
        </TabsContent>

        <TabsContent value="hero" className="mt-6">
          <HeroManagerPanel allSongs={songs} loading={songsLoading} />
        </TabsContent>

        <TabsContent value="downloads" className="mt-6">
          <DeviceWhitelistManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
