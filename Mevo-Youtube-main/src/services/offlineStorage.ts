import type { Song } from "@/data/songs";
import type { DownloadedTrack } from "@/types/download";

const DB_NAME = "mevo-offline-db";
const DB_VERSION = 1;
const STORE_NAME = "offline_tracks";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this browser."));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveOfflineSong(song: Song, audioBlob: Blob): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const record = {
      id: song.id,
      song,
      audioBlob,
      fileSize: audioBlob.size,
      downloadedAt: Date.now(),
    };

    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflineSong(songId: string): Promise<DownloadedTrack | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(songId);

      request.onsuccess = () => {
        const record = request.result;
        if (!record) {
          resolve(null);
          return;
        }

        const audioBlobUrl = URL.createObjectURL(record.audioBlob);
        resolve({
          song: record.song,
          audioBlobUrl,
          fileSize: record.fileSize,
          downloadedAt: record.downloadedAt,
        });
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Could not get offline song:", err);
    return null;
  }
}

export async function getAllOfflineSongs(): Promise<DownloadedTrack[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const records = request.result || [];
        const result: DownloadedTrack[] = records.map((rec: any) => ({
          song: rec.song,
          audioBlobUrl: URL.createObjectURL(rec.audioBlob),
          fileSize: rec.fileSize,
          downloadedAt: rec.downloadedAt,
        }));
        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Could not get all offline songs:", err);
    return [];
  }
}

export async function removeOfflineSong(songId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(songId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllOfflineStorage(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
