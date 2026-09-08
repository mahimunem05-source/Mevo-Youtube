import { useEffect, useMemo, useState, useCallback } from "react";
import {
  LoaderCircle,
  Search,
  Check,
  Edit2,
  Plus,
  RefreshCw,
  User,
  Sparkles,
  Music,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { getArtists, upsertArtist, type Artist } from "@/services/artistService";
import type { Song } from "@/services/songService";
import { groupSongsByArtist } from "@/lib/collection-utils";
import { ArtistEditDialog } from "./ArtistEditDialog";

interface ArtistManagerPanelProps {
  songs: Song[];
  loading?: boolean;
}

interface CombinedArtistItem {
  id?: string;
  name: string;
  image_url: string | null;
  is_verified: boolean;
  trackCount: number;
  fallbackCover: string | null;
  hasCustomImage: boolean;
}

function getArtistInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "♪";
}

export function ArtistManagerPanel({ songs }: ArtistManagerPanelProps) {
  const [dbArtists, setDbArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "verified" | "custom_photo">("all");

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<{
    id?: string;
    name: string;
    image_url?: string | null;
    is_verified?: boolean;
    fallbackCover?: string | null;
  } | null>(null);

  const loadDbArtists = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getArtists();
      setDbArtists(data);
    } catch (err) {
      console.error("Failed to load artists:", err);
      toast.error("Failed to load artists from database.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDbArtists();
  }, [loadDbArtists]);

  // Combine artists found in song tracks with custom artist profiles in DB
  const combinedArtists = useMemo<CombinedArtistItem[]>(() => {
    const dbMap = new Map<string, Artist>();
    for (const a of dbArtists) {
      dbMap.set(a.name.trim().toLowerCase(), a);
    }

    // Group songs to find track counts and fallback covers
    const songGroups = new Map<
      string,
      { count: number; fallbackCover: string | null; originalName: string }
    >();
    for (const song of songs) {
      const name = (song.artist || "").trim() || "Unknown Artist";
      const key = name.toLowerCase();
      const existing = songGroups.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.fallbackCover && song.cover_image) {
          existing.fallbackCover = song.cover_image;
        }
      } else {
        songGroups.set(key, {
          count: 1,
          fallbackCover: song.cover_image || null,
          originalName: name,
        });
      }
    }

    // Merge DB records
    const allKeys = new Set([...dbMap.keys(), ...songGroups.keys()]);
    const items: CombinedArtistItem[] = [];

    for (const key of allKeys) {
      const dbA = dbMap.get(key);
      const songG = songGroups.get(key);

      const name = dbA?.name || songG?.originalName || key;
      const imageUrl = dbA?.image_url || null;
      const isVerified = Boolean(dbA?.is_verified);
      const trackCount = songG?.count ?? 0;
      const fallbackCover = songG?.fallbackCover ?? null;
      const hasCustomImage = Boolean(imageUrl && imageUrl.trim().length > 0);

      items.push({
        id: dbA?.id,
        name,
        image_url: imageUrl,
        is_verified: isVerified,
        trackCount,
        fallbackCover,
        hasCustomImage,
      });
    }

    return items.sort((a, b) => a.name.localeCompare(b.name));
  }, [dbArtists, songs]);

  const filteredArtists = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return combinedArtists.filter((item) => {
      if (query && !item.name.toLowerCase().includes(query)) {
        return false;
      }

      if (filterMode === "verified" && !item.is_verified) {
        return false;
      }

      if (filterMode === "custom_photo" && !item.hasCustomImage) {
        return false;
      }

      return true;
    });
  }, [combinedArtists, searchQuery, filterMode]);

  const stats = useMemo(() => {
    const total = combinedArtists.length;
    const verified = combinedArtists.filter((a) => a.is_verified).length;
    const customPhotos = combinedArtists.filter((a) => a.hasCustomImage).length;
    return { total, verified, customPhotos };
  }, [combinedArtists]);

  function handleEditArtist(artist: CombinedArtistItem) {
    setSelectedArtist({
      id: artist.id,
      name: artist.name,
      image_url: artist.image_url,
      is_verified: artist.is_verified,
      fallbackCover: artist.fallbackCover,
    });
    setEditDialogOpen(true);
  }

  function handleAddNewArtist() {
    setSelectedArtist({
      name: "",
      image_url: null,
      is_verified: false,
      fallbackCover: null,
    });
    setEditDialogOpen(true);
  }

  async function handleToggleVerified(artist: CombinedArtistItem, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await upsertArtist({
        id: artist.id,
        name: artist.name,
        image_url: artist.image_url,
        is_verified: !artist.is_verified,
      });
      toast.success(
        `Artist "${artist.name}" is now ${!artist.is_verified ? "Verified" : "Unverified"}.`,
      );
      void loadDbArtists();
    } catch (err) {
      console.error("Toggle verified error:", err);
      toast.error("Failed to update verification status.");
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-[#12191D] border-white/10 text-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-white/60 text-xs font-semibold uppercase tracking-wider">
              Total Artists
            </CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center justify-between">
              <span>{loading ? "..." : stats.total}</span>
              <User className="size-5 text-teal-400 opacity-60" />
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-[#12191D] border-white/10 text-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-white/60 text-xs font-semibold uppercase tracking-wider">
              Verified Badges
            </CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center justify-between">
              <span>{loading ? "..." : stats.verified}</span>
              <Check className="size-5 text-teal-400 opacity-80 stroke-[3]" />
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-[#12191D] border-white/10 text-white">
          <CardHeader className="pb-2">
            <CardDescription className="text-white/60 text-xs font-semibold uppercase tracking-wider">
              Custom Photos
            </CardDescription>
            <CardTitle className="text-2xl font-bold flex items-center justify-between">
              <span>{loading ? "..." : stats.customPhotos}</span>
              <ImageIcon className="size-5 text-teal-400 opacity-60" />
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Main Panel Controls */}
      <div className="rounded-2xl border border-white/10 bg-[#12191D] p-4 sm:p-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Sparkles className="size-5 text-teal-400" />
              Artist Profiles & Custom Artwork
            </h2>
            <p className="text-xs text-white/60 mt-0.5">
              Set custom profile pictures and verified badges for any artist in your catalogue.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadDbArtists}
              disabled={loading}
              className="gap-1.5 text-xs border-white/15 bg-white/5 hover:bg-white/10 hover:text-white"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleAddNewArtist}
              className="gap-1.5 text-xs bg-[#4FD1C5] text-[#071012] font-bold hover:bg-[#4FD1C5]/90"
            >
              <Plus className="size-3.5" />
              Add Artist
            </Button>
          </div>
        </div>

        {/* Filter bar and Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-white/40" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search artists by name..."
              className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/40 text-xs sm:text-sm focus-visible:ring-teal-400"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <Button
              type="button"
              variant={filterMode === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterMode("all")}
              className={`text-xs h-8 ${
                filterMode === "all"
                  ? "bg-teal-400/20 text-teal-300 border-teal-400/50"
                  : "border-white/10 bg-white/5 text-white/70 hover:text-white"
              }`}
            >
              All ({combinedArtists.length})
            </Button>

            <Button
              type="button"
              variant={filterMode === "verified" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterMode("verified")}
              className={`text-xs h-8 gap-1 ${
                filterMode === "verified"
                  ? "bg-teal-400/20 text-teal-300 border-teal-400/50"
                  : "border-white/10 bg-white/5 text-white/70 hover:text-white"
              }`}
            >
              <Check className="size-3 stroke-[3]" />
              Verified ({stats.verified})
            </Button>

            <Button
              type="button"
              variant={filterMode === "custom_photo" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterMode("custom_photo")}
              className={`text-xs h-8 gap-1 ${
                filterMode === "custom_photo"
                  ? "bg-teal-400/20 text-teal-300 border-teal-400/50"
                  : "border-white/10 bg-white/5 text-white/70 hover:text-white"
              }`}
            >
              <ImageIcon className="size-3" />
              Custom Photo ({stats.customPhotos})
            </Button>
          </div>
        </div>

        {/* Artists List */}
        {loading && combinedArtists.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-12 text-sm text-white/50">
            <LoaderCircle className="size-5 animate-spin text-teal-400" />
            Loading artists...
          </div>
        ) : filteredArtists.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center text-white/50 text-xs sm:text-sm">
            No artists matched your filter criteria.
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 pt-2">
            {filteredArtists.map((artist) => {
              const displayImage = artist.image_url || artist.fallbackCover;

              return (
                <div
                  key={artist.name}
                  className="group relative flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 transition-all hover:bg-white/[0.06] hover:border-white/20"
                >
                  {/* Left: Avatar + Info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="relative shrink-0">
                      <div
                        className={`
                          size-12 rounded-full overflow-hidden border transition-all
                          ${artist.is_verified ? "border-[#4FD1C5]" : "border-white/15"}
                        `}
                      >
                        {displayImage ? (
                          <img
                            src={displayImage}
                            alt={artist.name}
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center bg-[#182227] text-xs font-bold text-teal-400">
                            {getArtistInitials(artist.name)}
                          </div>
                        )}
                      </div>

                      {artist.is_verified && (
                        <div
                          title="Verified Artist"
                          className="absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-[#4FD1C5] text-[#071012] border border-[#12191D]"
                        >
                          <Check className="size-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="truncate text-sm font-semibold text-white">{artist.name}</h4>
                      </div>

                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-white/50 flex items-center gap-1">
                          <Music className="size-3" />
                          {artist.trackCount} {artist.trackCount === 1 ? "track" : "tracks"}
                        </span>

                        {artist.hasCustomImage && (
                          <span className="rounded bg-teal-400/10 px-1.5 py-0.2 text-[9px] font-bold text-teal-400 border border-teal-400/20">
                            Custom
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => handleToggleVerified(artist, e)}
                      title={artist.is_verified ? "Remove verification" : "Mark as verified"}
                      className={`size-8 p-0 rounded-lg ${
                        artist.is_verified
                          ? "bg-teal-400/20 text-teal-400 hover:bg-teal-400/30"
                          : "text-white/40 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      <Check className="size-3.5 stroke-[2.5]" />
                    </Button>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditArtist(artist)}
                      title="Edit artist photo & details"
                      className="size-8 p-0 rounded-lg text-white/60 hover:text-white hover:bg-white/10"
                    >
                      <Edit2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <ArtistEditDialog
        open={editDialogOpen}
        artist={selectedArtist}
        onOpenChange={setEditDialogOpen}
        onSaved={loadDbArtists}
      />
    </div>
  );
}
