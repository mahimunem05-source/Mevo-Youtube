import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Disc3,
  Plus,
  Edit2,
  Trash2,
  Sparkles,
  Search,
  RefreshCw,
  FolderSync,
  Eye,
  EyeOff,
  Music2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { subscribeToRealtimeChanges } from "@/lib/realtime-helper";
import type { Song } from "@/services/songService";
import {
  deleteCustomAlbum,
  getCustomAlbums,
  setCustomAlbumPublished,
  updateAutoAlbumName,
  deleteAutoAlbum,
  syncLegacyAlbumsFromSongs,
  type CustomAlbum,
} from "@/services/customAlbumService";
import { CustomAlbumDialog } from "./CustomAlbumDialog";

interface MahiEditionManagerProps {
  songs: Song[];
  loading: boolean;
  error: string;
}

interface AutoAlbum {
  name: string;
  artist: string;
  cover: string | null;
  trackCount: number;
  songIds: string[];
}

export function MahiEditionManager({ songs, loading, error }: MahiEditionManagerProps) {
  const [customAlbums, setCustomAlbums] = useState<CustomAlbum[]>([]);
  const [customLoading, setCustomLoading] = useState(true);
  const [customError, setCustomError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Custom Album Modal State
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [editingCustomAlbum, setEditingCustomAlbum] = useState<CustomAlbum | null>(null);
  const [deletingCustomAlbum, setDeletingCustomAlbum] = useState<CustomAlbum | null>(null);
  const [promoteInitial, setPromoteInitial] = useState<{
    title: string;
    artist: string;
    songIds: string[];
  } | null>(null);

  // Auto Album Edit / Delete State
  const [editingAutoAlbum, setEditingAutoAlbum] = useState<AutoAlbum | null>(null);
  const [newAutoAlbumName, setNewAutoAlbumName] = useState("");
  const [deletingAutoAlbum, setDeletingAutoAlbum] = useState<AutoAlbum | null>(null);

  const [working, setWorking] = useState(false);

  const loadCustomAlbums = useCallback(async () => {
    setCustomLoading(true);
    setCustomError("");

    try {
      const albums = await getCustomAlbums();
      setCustomAlbums(albums);
    } catch (err: any) {
      setCustomError(err instanceof Error ? err.message : "Could not load custom albums.");
    } finally {
      setCustomLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCustomAlbums();

    const cleanup = subscribeToRealtimeChanges("admin-albums-sync", [
      {
        table: "custom_albums",
        callback: () => void loadCustomAlbums(),
      },
    ]);

    return cleanup;
  }, [loadCustomAlbums]);

  // Derive Auto Albums from all uploaded songs having an album metadata
  const autoAlbums = useMemo<AutoAlbum[]>(() => {
    const grouped = new Map<string, AutoAlbum>();

    for (const song of songs) {
      const name = (song.album ?? "").replace(/\s+/g, " ").trim();
      if (!name || /^singles?$/i.test(name) || /^unknown(?:\s+album)?$/i.test(name)) {
        continue;
      }

      const key = name.toLowerCase();
      const existing = grouped.get(key);

      if (existing) {
        existing.trackCount += 1;
        existing.songIds.push(song.id);
        existing.cover = existing.cover ?? song.cover_image;
        continue;
      }

      grouped.set(key, {
        name,
        artist: song.artist,
        cover: song.cover_image,
        trackCount: 1,
        songIds: [song.id],
      });
    }

    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [songs]);

  // Search filtered lists
  const filteredAutoAlbums = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return autoAlbums;
    return autoAlbums.filter(
      (a) => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q)
    );
  }, [autoAlbums, searchQuery]);

  const filteredCustomAlbums = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return customAlbums;
    return customAlbums.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        (a.artist && a.artist.toLowerCase().includes(q)) ||
        (a.description && a.description.toLowerCase().includes(q))
    );
  }, [customAlbums, searchQuery]);

  // --- AUTO ALBUM HANDLERS ---
  const handleOpenEditAutoAlbum = (album: AutoAlbum) => {
    setEditingAutoAlbum(album);
    setNewAutoAlbumName(album.name);
  };

  const handleSaveAutoAlbum = async () => {
    if (!editingAutoAlbum || !newAutoAlbumName.trim()) return;
    setWorking(true);
    try {
      await updateAutoAlbumName(
        editingAutoAlbum.name,
        newAutoAlbumName.trim(),
        editingAutoAlbum.songIds
      );
      toast.success(`Album renamed to "${newAutoAlbumName.trim()}".`);
      setEditingAutoAlbum(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to rename album.");
    } finally {
      setWorking(false);
    }
  };

  const handleDeleteAutoAlbum = async () => {
    if (!deletingAutoAlbum) return;
    setWorking(true);
    try {
      await deleteAutoAlbum(deletingAutoAlbum.name, deletingAutoAlbum.songIds);
      toast.success(`Removed album tag "${deletingAutoAlbum.name}" from ${deletingAutoAlbum.trackCount} songs.`);
      setDeletingAutoAlbum(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to delete album.");
    } finally {
      setWorking(false);
    }
  };

  const handlePromoteToCustom = (auto: AutoAlbum) => {
    setPromoteInitial({
      title: auto.name,
      artist: auto.artist,
      songIds: auto.songIds,
    });
    setEditingCustomAlbum(null);
    setCustomDialogOpen(true);
  };

  // --- CUSTOM ALBUM HANDLERS ---
  const handleTogglePublish = async (album: CustomAlbum) => {
    setWorking(true);
    try {
      await setCustomAlbumPublished(album.id, !album.published);
      toast.success(
        album.published ? `Unpublished "${album.title}".` : `Published "${album.title}".`
      );
      await loadCustomAlbums();
    } catch (err: any) {
      toast.error(err.message || "Failed to change status.");
    } finally {
      setWorking(false);
    }
  };

  const handleDeleteCustomAlbum = async () => {
    if (!deletingCustomAlbum) return;
    setWorking(true);
    try {
      await deleteCustomAlbum(deletingCustomAlbum.id);
      toast.success(`Deleted custom album "${deletingCustomAlbum.title}".`);
      setDeletingCustomAlbum(null);
      await loadCustomAlbums();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete album.");
    } finally {
      setWorking(false);
    }
  };

  const handleSyncLegacyAlbums = async () => {
    setWorking(true);
    try {
      const res = await syncLegacyAlbumsFromSongs();
      toast.success(
        `Sync completed! Created ${res.createdCount} new custom albums, updated ${res.syncedCount} albums (${res.totalTracks} tracks).`
      );
      await loadCustomAlbums();
    } catch (err: any) {
      toast.error(err.message || "Failed to sync legacy albums.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/[0.03] border border-white/10 p-5 rounded-2xl backdrop-blur-md">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
            <Disc3 className="size-6 text-teal-400" />
            Albums & Studio Edition Manager
          </h2>
          <p className="text-sm text-white/60 mt-1">
            Manage Auto Albums generated from song metadata and create hand-curated Custom Albums.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            type="button"
            variant="outline"
            disabled={working}
            onClick={() => void handleSyncLegacyAlbums()}
            className="flex items-center gap-2 border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 font-semibold text-xs rounded-xl"
          >
            <FolderSync className={`size-4 ${working ? "animate-spin" : ""}`} />
            Sync Legacy Albums
          </Button>

          <Button
            type="button"
            onClick={() => {
              setPromoteInitial(null);
              setEditingCustomAlbum(null);
              setCustomDialogOpen(true);
            }}
            className="flex items-center gap-2 bg-teal-500 hover:bg-teal-400 text-black font-bold text-xs rounded-xl shadow-md"
          >
            <Plus className="size-4 stroke-[2.5]" />
            Create Custom Album
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-white/40" />
        <input
          type="text"
          placeholder="Search albums by title or artist..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-teal-500/50 transition-colors"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="auto">
        <TabsList className="bg-black/40 border border-white/10 p-1 rounded-xl">
          <TabsTrigger value="auto" className="flex items-center gap-2 text-xs">
            Auto Albums
            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-white/10 text-white/70">
              {autoAlbums.length}
            </span>
          </TabsTrigger>
          <TabsTrigger value="custom" className="flex items-center gap-2 text-xs">
            Custom Albums
            <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-teal-500/20 text-teal-300 font-bold">
              {customAlbums.length}
            </span>
          </TabsTrigger>
        </TabsList>

        {/* 1. AUTO ALBUMS TAB */}
        <TabsContent value="auto" className="mt-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-white/80">
            <div>
              <p className="font-semibold text-teal-300">
                Found {autoAlbums.length} Auto Albums from uploaded songs.
              </p>
              <p className="text-[11px] text-white/60 mt-0.5">
                Click "Sync All to Custom" to automatically register all these albums in the Custom Albums table with full edit/delete control.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={working || autoAlbums.length === 0}
              onClick={() => void handleSyncLegacyAlbums()}
              className="bg-teal-500 hover:bg-teal-400 text-black text-xs font-bold rounded-lg shrink-0"
            >
              <FolderSync className={`size-3.5 mr-1.5 ${working ? "animate-spin" : ""}`} />
              Sync All to Custom
            </Button>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-white/60 py-12">
              <RefreshCw className="size-4 animate-spin text-teal-400" />
              Loading auto albums...
            </div>
          )}

          {!loading && filteredAutoAlbums.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-8 text-center space-y-2">
              <Disc3 className="size-8 text-white/20 mx-auto" />
              <p className="text-sm font-semibold text-white/80">No auto albums found</p>
              <p className="text-xs text-white/50">
                Upload songs with an "Album" name specified during upload, and they will automatically appear here.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredAutoAlbums.map((album) => (
              <div
                key={album.name}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-3.5 hover:border-white/20 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {album.cover ? (
                    <img
                      src={album.cover}
                      alt=""
                      className="size-14 shrink-0 rounded-xl object-cover border border-white/10 shadow-md"
                    />
                  ) : (
                    <div className="size-14 shrink-0 rounded-xl bg-white/5 border border-white/10 grid place-items-center text-teal-400">
                      <Music2 className="size-6" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-bold text-white">{album.name}</h3>
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                        Auto
                      </span>
                    </div>
                    <p className="truncate text-xs text-white/60 mt-0.5">
                      {album.artist} · {album.trackCount} {album.trackCount === 1 ? "track" : "tracks"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    title="Promote to Custom Album"
                    onClick={() => handlePromoteToCustom(album)}
                    className="h-8 px-2.5 text-xs bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border-teal-500/30"
                  >
                    <FolderSync className="size-3.5 mr-1" />
                    Custom
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    title="Edit Album Title"
                    onClick={() => handleOpenEditAutoAlbum(album)}
                    className="h-8 w-8 p-0 border-white/10 text-white/80 hover:text-white"
                  >
                    <Edit2 className="size-3.5" />
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    title="Remove Album tag from songs"
                    onClick={() => setDeletingAutoAlbum(album)}
                    className="h-8 w-8 p-0 bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* 2. CUSTOM ALBUMS TAB */}
        <TabsContent value="custom" className="mt-5 space-y-4">
          <div className="flex items-center justify-between text-xs text-white/60">
            <span>
              Custom Albums are hand-crafted studio collections with custom cover artwork, descriptions, and custom track ordering.
            </span>
          </div>

          {customLoading && (
            <div className="flex items-center justify-center gap-2 text-sm text-white/60 py-12">
              <RefreshCw className="size-4 animate-spin text-teal-400" />
              Loading custom albums...
            </div>
          )}

          {customError && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-300 flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              <span>{customError} (Make sure to run the Supabase migration script).</span>
            </div>
          )}

          {!customLoading && filteredCustomAlbums.length === 0 && (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-8 text-center space-y-2">
              <Sparkles className="size-8 text-teal-400/40 mx-auto" />
              <p className="text-sm font-semibold text-white/80">No custom albums created yet</p>
              <p className="text-xs text-white/50">
                Click "Create Custom Album" to assemble curated multi-track studio editions.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredCustomAlbums.map((album) => (
              <div
                key={album.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 p-3.5 hover:border-white/20 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {album.cover_url || album.cover_image ? (
                    <img
                      src={album.cover_url || album.cover_image || ""}
                      alt=""
                      className="size-14 shrink-0 rounded-xl object-cover border border-white/10 shadow-md"
                    />
                  ) : (
                    <div className="size-14 shrink-0 rounded-xl bg-white/5 border border-white/10 grid place-items-center text-teal-400">
                      <Music2 className="size-6" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-bold text-white">{album.title}</h3>
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/30">
                        {album.type || "Custom"}
                      </span>
                    </div>
                    <p className="truncate text-xs text-white/60 mt-0.5">
                      {album.artist || "Curated Edition"} · {album.songIds.length} tracks ·{" "}
                      <span className={album.published ? "text-emerald-400 font-semibold" : "text-amber-400"}>
                        {album.published ? "Published" : "Draft"}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    title={album.published ? "Unpublish" : "Publish"}
                    disabled={working}
                    onClick={() => void handleTogglePublish(album)}
                    className="h-8 w-8 p-0 border-white/10 text-white/80 hover:text-white"
                  >
                    {album.published ? <Eye className="size-3.5 text-emerald-400" /> : <EyeOff className="size-3.5 text-white/40" />}
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    title="Edit Album"
                    disabled={working}
                    onClick={() => {
                      setPromoteInitial(null);
                      setEditingCustomAlbum(album);
                      setCustomDialogOpen(true);
                    }}
                    className="h-8 w-8 p-0 border-white/10 text-white/80 hover:text-white"
                  >
                    <Edit2 className="size-3.5" />
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    title="Delete Custom Album"
                    disabled={working}
                    onClick={() => setDeletingCustomAlbum(album)}
                    className="h-8 w-8 p-0 bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/30"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Custom Album Create / Edit Dialog */}
      <CustomAlbumDialog
        open={customDialogOpen}
        album={editingCustomAlbum}
        songs={songs}
        initialTitle={promoteInitial?.title}
        initialArtist={promoteInitial?.artist}
        initialSongIds={promoteInitial?.songIds}
        onOpenChange={(open) => {
          setCustomDialogOpen(open);
          if (!open) {
            setEditingCustomAlbum(null);
            setPromoteInitial(null);
          }
        }}
        onSaved={() => {
          void loadCustomAlbums();
          toast.success("Custom album saved successfully!");
        }}
      />

      {/* Auto Album Rename Dialog */}
      <Dialog open={Boolean(editingAutoAlbum)} onOpenChange={(open) => !open && setEditingAutoAlbum(null)}>
        <DialogContent className="max-w-md bg-[#10171a] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Rename Auto Album</DialogTitle>
            <DialogDescription className="text-white/60 text-xs">
              This will update the <code>album</code> field for all {editingAutoAlbum?.trackCount} songs associated with this album.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <Label className="text-xs font-semibold text-white/80">New Album Name</Label>
            <Input
              value={newAutoAlbumName}
              onChange={(e) => setNewAutoAlbumName(e.target.value)}
              placeholder="Album title..."
              className="bg-black/30 border-white/10 text-xs"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingAutoAlbum(null)}
              className="border-white/10 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={working || !newAutoAlbumName.trim()}
              onClick={() => void handleSaveAutoAlbum()}
              className="bg-teal-500 hover:bg-teal-400 text-black text-xs font-bold"
            >
              {working ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto Album Delete Dialog */}
      <AlertDialog open={Boolean(deletingAutoAlbum)} onOpenChange={(open) => !open && setDeletingAutoAlbum(null)}>
        <AlertDialogContent className="bg-[#10171a] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Remove Auto Album?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60 text-xs">
              This will remove the album tag "{deletingAutoAlbum?.name}" from all {deletingAutoAlbum?.trackCount} songs. The original song files and tracks will NOT be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working} className="border-white/10 text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={working}
              onClick={() => void handleDeleteAutoAlbum()}
              className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold"
            >
              {working ? "Removing..." : "Remove Album"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Custom Album Delete Dialog */}
      <AlertDialog open={Boolean(deletingCustomAlbum)} onOpenChange={(open) => !open && setDeletingCustomAlbum(null)}>
        <AlertDialogContent className="bg-[#10171a] border-white/10 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold">Delete Custom Album?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/60 text-xs">
              "{deletingCustomAlbum?.title}" will be permanently removed from custom albums. Original songs are never deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working} className="border-white/10 text-xs">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={working}
              onClick={() => void handleDeleteCustomAlbum()}
              className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold"
            >
              {working ? "Deleting..." : "Delete Album"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
