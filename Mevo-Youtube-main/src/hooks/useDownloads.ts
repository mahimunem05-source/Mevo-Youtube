import { useEffect, useState, useCallback, useMemo } from "react";
import type { Song } from "@/data/songs";
import type { DownloadedTrack } from "@/types/download";
import { downloadService } from "@/services/downloadService";
import { formatBytes } from "@/services/offlineStorage";

export function useDownloads() {
  const [downloadedTracks, setDownloadedTracks] = useState<DownloadedTrack[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refreshDownloads = useCallback(async () => {
    try {
      const tracks = await downloadService.getAllDownloadedTracks();
      setDownloadedTracks(tracks);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshDownloads();
    const unsubscribe = downloadService.subscribe(() => {
      void refreshDownloads();
    });
    return () => {
      unsubscribe();
    };
  }, [refreshDownloads]);

  const totalStorageBytes = useMemo(() => {
    return downloadedTracks.reduce((acc, item) => acc + item.fileSize, 0);
  }, [downloadedTracks]);

  const downloadedIds = useMemo(() => {
    return new Set(downloadedTracks.map((item) => item.song.id));
  }, [downloadedTracks]);

  const isDownloaded = useCallback(
    (songId: string) => (songId ? downloadedIds.has(songId) : false),
    [downloadedIds]
  );

  const isDownloading = useCallback(
    (songId: string) => (songId ? downloadService.isDownloading(songId) : false),
    []
  );

  const getProgress = useCallback(
    (songId: string) => (songId ? downloadService.getProgress(songId) : 0),
    []
  );

  const startDownload = useCallback(async (song: Song) => {
    if (!song || !song.id) return;
    await downloadService.startDownload(song);
  }, []);

  const cancelDownload = useCallback((songId: string) => {
    if (!songId) return;
    downloadService.cancelDownload(songId);
  }, []);

  const removeDownload = useCallback(async (song: Song) => {
    if (!song || !song.id) return;
    await downloadService.removeDownload(song);
  }, []);

  const clearAllDownloads = useCallback(async () => {
    await downloadService.clearAllDownloads();
  }, []);

  return {
    downloadedTracks,
    downloadedSongs: downloadedTracks.map((t) => t.song),
    isLoading,
    totalStorageBytes,
    totalStorageFormatted: formatBytes(totalStorageBytes),
    isDownloaded,
    isDownloading,
    getProgress,
    startDownload,
    cancelDownload,
    removeDownload,
    clearAllDownloads,
    refreshDownloads,
  };
}

export default useDownloads;
