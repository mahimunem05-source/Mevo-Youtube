import type { Song } from "@/data/songs";

export type DownloadStatus = "not-downloaded" | "downloading" | "downloaded" | "failed";

export interface DownloadedTrack {
  song: Song;
  audioBlobUrl: string;
  fileSize: number; // Bytes
  downloadedAt: number; // Timestamp
}

export interface DownloadProgressState {
  songId: string;
  progress: number; // 0 - 100
  status: DownloadStatus;
  error?: string;
}
