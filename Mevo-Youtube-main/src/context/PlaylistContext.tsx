import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Song } from "@/data/songs";
import { recordTrackLiked } from "@/lib/user-taste";
import { slugify } from "@/lib/collection-utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

export interface UserPlaylist {
  id: string;
  name: string;
  slug: string;
  description: string;
  coverUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  tracks: Song[];
}

export interface CreatePlaylistInput {
  name: string;
  description?: string;
  coverUrl?: string | null;
  initialTrack?: Song;
}

export interface UpdatePlaylistInput {
  name?: string;
  description?: string;
  coverUrl?: string | null;
}

interface PlaylistContextType {
  playlists: UserPlaylist[];
  isLoading: boolean;
  createPlaylist: (input: CreatePlaylistInput) => UserPlaylist;
  updatePlaylist: (id: string, updates: UpdatePlaylistInput) => void;
  deletePlaylist: (id: string) => void;
  addTrackToPlaylist: (playlistId: string, track: Song) => boolean;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  toggleTrackInPlaylist: (playlistId: string, track: Song) => boolean;
  isTrackInPlaylist: (playlistId: string, trackId: string) => boolean;
  getPlaylist: (idOrSlug: string) => UserPlaylist | undefined;
  // Modal Controller
  addToPlaylistTrack: Song | null;
  openAddToPlaylistModal: (track: Song) => void;
  closeAddToPlaylistModal: () => void;
  isCreateModalOpen: boolean;
  editingPlaylist: UserPlaylist | null;
  openCreatePlaylistModal: (playlistToEdit?: UserPlaylist | null, initialTrack?: Song | null) => void;
  closeCreatePlaylistModal: () => void;
  pendingTrackForNewPlaylist: Song | null;
}

const PLAYLISTS_STORAGE_KEY = "mevo_user_playlists";

function readStoredPlaylists(): UserPlaylist[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PLAYLISTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (p): p is UserPlaylist =>
          Boolean(p && typeof p === "object" && typeof p.id === "string" && typeof p.name === "string" && Array.isArray(p.tracks))
      );
    }
  } catch (err) {
    console.warn("Failed to read stored playlists:", err);
  }
  return [];
}

function saveStoredPlaylists(playlists: UserPlaylist[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLAYLISTS_STORAGE_KEY, JSON.stringify(playlists));
  } catch (err) {
    console.warn("Failed to save playlists to localStorage:", err);
  }
}

/**
 * Returns dynamic cover URL for playlist if no custom cover is set:
 * Uses the first track's cover or null.
 */
export function getPlaylistDisplayCover(playlist: UserPlaylist): string | null {
  if (playlist.coverUrl && playlist.coverUrl.trim()) {
    return playlist.coverUrl.trim();
  }
  if (playlist.tracks.length > 0 && playlist.tracks[0]?.cover) {
    return playlist.tracks[0].cover;
  }
  return null;
}

const PlaylistContext = createContext<PlaylistContextType | null>(null);

export function PlaylistProvider({ children }: { children: React.ReactNode }) {
  const [playlists, setPlaylists] = useState<UserPlaylist[]>(() => readStoredPlaylists());
  const [isLoading, setIsLoading] = useState(false);

  // Modal states
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<Song | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<UserPlaylist | null>(null);
  const [pendingTrackForNewPlaylist, setPendingTrackForNewPlaylist] = useState<Song | null>(null);

  // Cross-tab storage sync
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === PLAYLISTS_STORAGE_KEY) {
        setPlaylists(readStoredPlaylists());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const createPlaylist = useCallback(
    (input: CreatePlaylistInput): UserPlaylist => {
      const now = new Date().toISOString();
      const uniqueId = `pl-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const baseSlug = slugify(input.name) || `playlist-${Date.now()}`;
      
      const newPlaylist: UserPlaylist = {
        id: uniqueId,
        name: input.name.trim() || "Untitled Playlist",
        slug: `${baseSlug}-${Date.now().toString(36)}`,
        description: input.description?.trim() || "",
        coverUrl: input.coverUrl?.trim() || null,
        createdAt: now,
        updatedAt: now,
        tracks: input.initialTrack ? [input.initialTrack] : [],
      };

      setPlaylists((prev) => {
        const next = [newPlaylist, ...prev];
        saveStoredPlaylists(next);
        return next;
      });

      toast.success(`Created "${newPlaylist.name}"`);
      return newPlaylist;
    },
    []
  );

  const updatePlaylist = useCallback(
    (id: string, updates: UpdatePlaylistInput) => {
      setPlaylists((prev) => {
        const index = prev.findIndex((p) => p.id === id);
        if (index === -1) return prev;

        const current = prev[index];
        const next = [...prev];
        next[index] = {
          ...current,
          name: updates.name !== undefined ? updates.name.trim() : current.name,
          description:
            updates.description !== undefined ? updates.description.trim() : current.description,
          coverUrl: updates.coverUrl !== undefined ? updates.coverUrl?.trim() || null : current.coverUrl,
          updatedAt: new Date().toISOString(),
        };

        saveStoredPlaylists(next);
        toast.success(`Updated "${next[index].name}"`);
        return next;
      });
    },
    []
  );

  const deletePlaylist = useCallback((id: string) => {
    setPlaylists((prev) => {
      const target = prev.find((p) => p.id === id);
      const next = prev.filter((p) => p.id !== id);
      saveStoredPlaylists(next);
      if (target) {
        toast.info(`Deleted "${target.name}"`);
      }
      return next;
    });
  }, []);

  const addTrackToPlaylist = useCallback((playlistId: string, track: Song): boolean => {
    let added = false;
    setPlaylists((prev) => {
      const index = prev.findIndex((p) => p.id === playlistId);
      if (index === -1) return prev;

      const current = prev[index];
      if (current.tracks.some((t) => t.id === track.id)) {
        return prev; // already exists
      }

      const next = [...prev];
      next[index] = {
        ...current,
        tracks: [...current.tracks, track],
        updatedAt: new Date().toISOString(),
      };

      saveStoredPlaylists(next);
      added = true;
      return next;
    });

    if (added) {
      recordTrackLiked(track);
      toast.success(`Added "${track.title}" to playlist`);
    }
    return added;
  }, []);

  const removeTrackFromPlaylist = useCallback((playlistId: string, trackId: string) => {
    setPlaylists((prev) => {
      const index = prev.findIndex((p) => p.id === playlistId);
      if (index === -1) return prev;

      const current = prev[index];
      const removedTrack = current.tracks.find((t) => t.id === trackId);
      const next = [...prev];
      next[index] = {
        ...current,
        tracks: current.tracks.filter((t) => t.id !== trackId),
        updatedAt: new Date().toISOString(),
      };

      saveStoredPlaylists(next);
      if (removedTrack) {
        toast.info(`Removed "${removedTrack.title}" from ${current.name}`);
      }
      return next;
    });
  }, []);

  const toggleTrackInPlaylist = useCallback((playlistId: string, track: Song): boolean => {
    let nowIncluded = false;
    setPlaylists((prev) => {
      const index = prev.findIndex((p) => p.id === playlistId);
      if (index === -1) return prev;

      const current = prev[index];
      const exists = current.tracks.some((t) => t.id === track.id);
      const next = [...prev];

      if (exists) {
        next[index] = {
          ...current,
          tracks: current.tracks.filter((t) => t.id !== track.id),
          updatedAt: new Date().toISOString(),
        };
        nowIncluded = false;
        toast.info(`Removed "${track.title}" from ${current.name}`);
      } else {
        next[index] = {
          ...current,
          tracks: [...current.tracks, track],
          updatedAt: new Date().toISOString(),
        };
        nowIncluded = true;
        toast.success(`Added "${track.title}" to ${current.name}`);
      }

      saveStoredPlaylists(next);
      return next;
    });

    return nowIncluded;
  }, []);

  const isTrackInPlaylist = useCallback(
    (playlistId: string, trackId: string): boolean => {
      const playlist = playlists.find((p) => p.id === playlistId);
      if (!playlist) return false;
      return playlist.tracks.some((t) => t.id === trackId);
    },
    [playlists]
  );

  const getPlaylist = useCallback(
    (idOrSlug: string): UserPlaylist | undefined => {
      return playlists.find((p) => p.id === idOrSlug || p.slug === idOrSlug);
    },
    [playlists]
  );

  // Modal helpers
  const openAddToPlaylistModal = useCallback((track: Song) => {
    setAddToPlaylistTrack(track);
  }, []);

  const closeAddToPlaylistModal = useCallback(() => {
    setAddToPlaylistTrack(null);
  }, []);

  const openCreatePlaylistModal = useCallback(
    (playlistToEdit: UserPlaylist | null = null, initialTrack: Song | null = null) => {
      setEditingPlaylist(playlistToEdit);
      setPendingTrackForNewPlaylist(initialTrack);
      setIsCreateModalOpen(true);
    },
    []
  );

  const closeCreatePlaylistModal = useCallback(() => {
    setIsCreateModalOpen(false);
    setEditingPlaylist(null);
    setPendingTrackForNewPlaylist(null);
  }, []);

  const value = useMemo<PlaylistContextType>(
    () => ({
      playlists,
      isLoading,
      createPlaylist,
      updatePlaylist,
      deletePlaylist,
      addTrackToPlaylist,
      removeTrackFromPlaylist,
      toggleTrackInPlaylist,
      isTrackInPlaylist,
      getPlaylist,
      addToPlaylistTrack,
      openAddToPlaylistModal,
      closeAddToPlaylistModal,
      isCreateModalOpen,
      editingPlaylist,
      openCreatePlaylistModal,
      closeCreatePlaylistModal,
      pendingTrackForNewPlaylist,
    }),
    [
      playlists,
      isLoading,
      createPlaylist,
      updatePlaylist,
      deletePlaylist,
      addTrackToPlaylist,
      removeTrackFromPlaylist,
      toggleTrackInPlaylist,
      isTrackInPlaylist,
      getPlaylist,
      addToPlaylistTrack,
      openAddToPlaylistModal,
      closeAddToPlaylistModal,
      isCreateModalOpen,
      editingPlaylist,
      openCreatePlaylistModal,
      closeCreatePlaylistModal,
      pendingTrackForNewPlaylist,
    ]
  );

  return <PlaylistContext.Provider value={value}>{children}</PlaylistContext.Provider>;
}

export function usePlaylists() {
  const context = useContext(PlaylistContext);
  if (!context) {
    throw new Error("usePlaylists must be used within a PlaylistProvider");
  }
  return context;
}
