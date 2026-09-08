import { isYouTubeSong, type Song } from "@/data/songs";
import {
  saveOfflineSong,
  removeOfflineSong,
  getOfflineSong,
  getAllOfflineSongs,
  clearAllOfflineStorage,
} from "./offlineStorage";
import type { DownloadedTrack } from "@/types/download";
import { getExtractorBaseUrl, extractYouTubeVideoId } from "@/lib/extractor";
import { getDeviceId } from "@/utils/device";
import { toast } from "sonner";

type StatusListener = () => void;

class DownloadService {
  private activeControllers = new Map<string, AbortController>();
  private activeProgress = new Map<string, number>();
  private listeners = new Set<StatusListener>();

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  getProgress(songId: string): number {
    return this.activeProgress.get(songId) ?? 0;
  }

  isDownloading(songId: string): boolean {
    return this.activeControllers.has(songId);
  }

  async isDownloaded(songId: string): Promise<boolean> {
    const song = await getOfflineSong(songId);
    return song !== null;
  }

  async startDownload(song: Song): Promise<void> {
    if (this.isDownloading(song.id)) return;

    const alreadyDownloaded = await this.isDownloaded(song.id);
    if (alreadyDownloaded) {
      toast("Already Downloaded", {
        duration: 2000,
        id: `download-already-${song.id}`,
      });
      return;
    }

    const controller = new AbortController();
    this.activeControllers.set(song.id, controller);
    this.activeProgress.set(song.id, 0);
    this.notify();

    const toastId = `download-${song.id}`;
    toast.loading("Preparing download...", { id: toastId });

    try {
      const isYt =
        isYouTubeSong(song) ||
        song.id.startsWith("yt-") ||
        !song.audio ||
        song.audio.includes("/stream");
      const cleanId = extractYouTubeVideoId(song.id);
      const deviceId = getDeviceId();
      const downloadUrl = isYt
        ? `${getExtractorBaseUrl()}/api/download?songId=${encodeURIComponent(cleanId || song.id)}&deviceId=${encodeURIComponent(deviceId)}`
        : song.audio;

      const res = await fetch(downloadUrl, {
        signal: controller.signal,
        headers: {
          "X-Device-ID": deviceId,
        },
      });
      if (!res.ok) {
        let errMsg = `HTTP error ${res.status}`;
        try {
          const errData = await res.json();
          if (errData.error) errMsg = errData.error;
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }

      const contentLength = Number(res.headers.get("content-length")) || 0;
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No readable audio stream received");

      const chunks: BlobPart[] = [];
      let received = 0;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          const pct = contentLength ? Math.round((received / contentLength) * 100) : 60;
          this.activeProgress.set(song.id, pct);
          this.notify();
        }
      }

      const blob = new Blob(chunks, { type: "audio/mpeg" });
      await saveOfflineSong(song, blob);

      // Trigger native browser file download
      if (typeof window !== "undefined") {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        const cleanTitle = `${song.title} - ${song.artist}`
          .replace(/[<>:"/\\|?*]/g, "_")
          .trim();
        a.href = url;
        a.download = `${cleanTitle || "track"}.mp3`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => window.URL.revokeObjectURL(url), 2000);
      }

      toast.success("Download complete", {
        duration: 2500,
        id: toastId,
      });
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Download failed:", err);
        toast.error(`Download failed: ${err.message || "Network error"}`, {
          duration: 3000,
          id: toastId,
        });
      }
    } finally {
      this.activeControllers.delete(song.id);
      this.activeProgress.delete(song.id);
      this.notify();
    }
  }

  cancelDownload(songId: string): void {
    const controller = this.activeControllers.get(songId);
    if (controller) {
      controller.abort();
    }
  }

  async removeDownload(song: Song): Promise<void> {
    try {
      await removeOfflineSong(song.id);
      this.notify();
    } catch (err) {
      toast.error("Could not remove download.", {
        duration: 2500,
        id: "download-error-toast",
      });
    }
  }

  async clearAllDownloads(): Promise<void> {
    try {
      await clearAllOfflineStorage();
      this.notify();
    } catch (err) {
      toast.error("Could not clear downloads.", {
        duration: 2500,
        id: "download-error-toast",
      });
    }
  }

  async getAllDownloadedTracks(): Promise<DownloadedTrack[]> {
    return getAllOfflineSongs();
  }
}

export const downloadService = new DownloadService();
