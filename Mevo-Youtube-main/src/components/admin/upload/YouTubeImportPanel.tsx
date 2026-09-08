import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  LoaderCircle,
  Music,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Youtube,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  SONG_SECTION_OPTIONS,
  type Song,
  type SongSection,
} from "@/services/songService";
import {
  checkExtractorHealth,
  extractYouTubeVideoId,
  getVideoInfo,
  type ExtractorVideoInfo,
} from "@/lib/extractor";
import {
  searchYouTube,
  getYouTubeApiKey,
  type YouTubeSearchResult,
} from "@/services/youtube";
import {
  importYouTubeTrack,
  type ImportStage,
} from "@/services/audioImporter";
import { SectionSelect } from "./DraftFields";
import { usePlayer } from "@/lib/player-context";
import { databaseSongToPlayerSong } from "@/lib/song-adapter";

interface YouTubeImportPanelProps {
  onPublished: () => void;
  onManageSong: (songId: string) => void;
}

const STAGE_LABELS: Record<ImportStage, string> = {
  "fetching-info": "Fetching video information...",
  "extracting-audio": "Extracting and encoding MP3 audio...",
  "processing-files": "Processing audio and cover files...",
  "uploading-audio": "Uploading audio to Backblaze B2 storage...",
  "uploading-cover": "Uploading cover artwork to storage...",
  "saving-database": "Saving song record to Supabase database...",
  completed: "Song successfully imported to Mevo!",
};

const STAGE_PROGRESS: Record<ImportStage, number> = {
  "fetching-info": 15,
  "extracting-audio": 40,
  "processing-files": 60,
  "uploading-audio": 80,
  "uploading-cover": 90,
  "saving-database": 95,
  completed: 100,
};

export function YouTubeImportPanel({ onPublished, onManageSong }: YouTubeImportPanelProps) {
  const { play } = usePlayer();

  // Microservice Health
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [backendError, setBackendError] = useState<string>("");

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<YouTubeSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Direct URL/ID Input state
  const [directInput, setDirectInput] = useState("");
  const [directLoading, setDirectLoading] = useState(false);
  const [directInfo, setDirectInfo] = useState<ExtractorVideoInfo | null>(null);

  // Active track to import / edit
  const [selectedVideo, setSelectedVideo] = useState<{
    id: string;
    title: string;
    artist: string;
    album: string;
    genre: string;
    section: SongSection;
    thumbnail: string;
    duration?: number;
    quality: "fast" | "128";
  } | null>(null);

  // Import Execution state
  const [importing, setImporting] = useState(false);
  const [currentStage, setCurrentStage] = useState<ImportStage | null>(null);
  const [stageDetail, setStageDetail] = useState("");
  const [importProgress, setImportProgress] = useState(0);
  const [importedSong, setImportedSong] = useState<Song | null>(null);

  const hasApiKey = Boolean(getYouTubeApiKey());

  const verifyBackend = useCallback(async () => {
    setBackendStatus("checking");
    setBackendError("");
    try {
      await checkExtractorHealth();
      setBackendStatus("online");
    } catch (err) {
      setBackendStatus("offline");
      setBackendError(err instanceof Error ? err.message : "Service offline");
    }
  }, []);

  useEffect(() => {
    void verifyBackend();
  }, [verifyBackend]);

  async function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    // If query looks like a YouTube URL or direct ID, switch to direct import
    const extractedId = extractYouTubeVideoId(q);
    if (q.includes("youtube.com") || q.includes("youtu.be") || (extractedId.length === 11 && !q.includes(" "))) {
      setDirectInput(q);
      void handleDirectFetch(q);
      return;
    }

    setSearching(true);
    setSearchError("");
    setSearchResults([]);

    try {
      const results = await searchYouTube(q);
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError("No YouTube videos found matching your query.");
      }
    } catch (err) {
      console.error("YouTube search error:", err);
      const msg = err instanceof Error ? err.message : "Failed to search YouTube.";
      setSearchError(msg);
      toast.error(msg);
    } finally {
      setSearching(false);
    }
  }

  async function handleDirectFetch(customUrl?: string) {
    const raw = (customUrl || directInput).trim();
    if (!raw) return;

    const videoId = extractYouTubeVideoId(raw);
    if (!videoId) {
      toast.error("Please enter a valid YouTube URL or Video ID.");
      return;
    }

    setDirectLoading(true);
    setDirectInfo(null);

    try {
      const info = await getVideoInfo(videoId);
      setDirectInfo(info);
      prepareForImport({
        id: info.id,
        title: info.title,
        channel: info.uploader || "YouTube Artist",
        thumbnail: info.thumbnail || `https://img.youtube.com/vi/${info.id}/hqdefault.jpg`,
      });
    } catch (err) {
      console.error("Direct fetch error:", err);
      const msg = err instanceof Error ? err.message : "Could not fetch YouTube video info.";
      toast.error(msg);
    } finally {
      setDirectLoading(false);
    }
  }

  function prepareForImport(item: {
    id: string;
    title: string;
    channel: string;
    thumbnail: string;
    duration?: number;
  }) {
    // Attempt basic cleanup of song title & artist if title has "Artist - Title" format
    let cleanTitle = item.title;
    let cleanArtist = item.channel;

    if (item.title.includes(" - ")) {
      const parts = item.title.split(" - ");
      if (parts.length >= 2) {
        cleanArtist = parts[0].trim();
        cleanTitle = parts.slice(1).join(" - ").trim();
      }
    }

    // Clean common YouTube suffixes e.g. [Official Video], (Audio), (Lyric Video)
    cleanTitle = cleanTitle
      .replace(/\[(?:Official|Official Video|Official Audio|Lyric Video|Music Video|HD|4K)[^\]]*\]/gi, "")
      .replace(/\((?:Official|Official Video|Official Audio|Lyric Video|Music Video|HD|4K)[^)]*\)/gi, "")
      .trim();

    setSelectedVideo({
      id: item.id,
      title: cleanTitle,
      artist: cleanArtist,
      album: "",
      genre: "Pop",
      section: "global-tracks",
      thumbnail: item.thumbnail,
      duration: item.duration,
      quality: "fast",
    });

    setImportedSong(null);
  }

  async function handleExecuteImport() {
    if (!selectedVideo) return;

    setImporting(true);
    setCurrentStage("fetching-info");
    setImportProgress(STAGE_PROGRESS["fetching-info"]);
    setStageDetail(STAGE_LABELS["fetching-info"]);

    const toastId = toast.loading(`Importing "${selectedVideo.title}" from YouTube...`);

    try {
      const result = await importYouTubeTrack(
        {
          id: selectedVideo.id,
          title: selectedVideo.title,
          artist: selectedVideo.artist,
          album: selectedVideo.album || null,
          genre: selectedVideo.genre || null,
          section: selectedVideo.section,
          thumbnail: selectedVideo.thumbnail,
          duration: selectedVideo.duration,
          quality: selectedVideo.quality,
        },
        {
          onProgress: (stage, details) => {
            setCurrentStage(stage);
            setImportProgress(STAGE_PROGRESS[stage] || 50);
            setStageDetail(details?.message || STAGE_LABELS[stage]);
          },
        }
      );

      setImportedSong(result.song);
      toast.success(`Successfully imported "${result.song.title}" by ${result.song.artist}!`, {
        id: toastId,
      });

      onPublished();
    } catch (err) {
      console.error("Import execution failed:", err);
      const msg = err instanceof Error ? err.message : "YouTube import failed.";
      toast.error(msg, { id: toastId });
      setCurrentStage(null);
    } finally {
      setImporting(false);
    }
  }

  function handlePlayNow(song: Song) {
    const playerSong = databaseSongToPlayerSong(song);
    play(playerSong);
    toast.success(`Now playing: ${song.title}`);
  }

  return (
    <div className="space-y-6">
      {/* Service Health Banner */}
      <Card className="border-border/60 bg-card/70 backdrop-blur">
        <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-red-500/10 p-2 text-red-500">
              <Youtube className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">YouTube Audio Extractor Microservice</span>
                {backendStatus === "checking" && (
                  <Badge variant="outline" className="text-xs">
                    <LoaderCircle className="size-3 animate-spin mr-1" /> Checking...
                  </Badge>
                )}
                {backendStatus === "online" && (
                  <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-500 text-xs">
                    <CheckCircle2 className="size-3 mr-1" /> Online
                  </Badge>
                )}
                {backendStatus === "offline" && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="size-3 mr-1" /> Offline
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {backendStatus === "online"
                  ? "Connected to Python backend on port 5001. Ready for instant extraction."
                  : "Ensure `python backend/extractor_api.py` is running in your terminal."}
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void verifyBackend()}
            disabled={backendStatus === "checking"}
            className="text-xs h-8"
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${backendStatus === "checking" ? "animate-spin" : ""}`} />
            Check Connection
          </Button>
        </CardContent>
      </Card>

      {/* Main Import Interface */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Search & Direct URL Input */}
        <div className="space-y-6 lg:col-span-7">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="size-5 text-red-500" />
                Search or Enter YouTube URL
              </CardTitle>
              <CardDescription>
                Search YouTube catalogue or paste any YouTube video link / 11-character video ID.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Search Form */}
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder={
                      hasApiKey
                        ? "Search by song name, artist, or paste YouTube URL..."
                        : "Paste YouTube URL or video ID..."
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    disabled={searching || importing}
                  />
                </div>
                <Button type="submit" disabled={searching || importing || !searchQuery.trim()}>
                  {searching ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin mr-2" /> Searching...
                    </>
                  ) : (
                    "Search / Fetch"
                  )}
                </Button>
              </form>

              {/* Direct Paste Shortcut */}
              <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground font-medium">Quick Direct Link:</span>
                  <div className="flex flex-1 max-w-sm gap-1.5">
                    <Input
                      placeholder="e.g. https://youtu.be/dQw4w9WgXcQ"
                      value={directInput}
                      onChange={(e) => setDirectInput(e.target.value)}
                      className="h-8 text-xs"
                      disabled={directLoading || importing}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 text-xs"
                      onClick={() => void handleDirectFetch()}
                      disabled={directLoading || importing || !directInput.trim()}
                    >
                      {directLoading ? <LoaderCircle className="size-3 animate-spin" /> : "Fetch"}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Search Results List */}
              {searchError && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  {searchError}
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="space-y-2 mt-4 max-h-[420px] overflow-y-auto pr-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Search Results ({searchResults.length})
                  </p>
                  <div className="space-y-2">
                    {searchResults.map((item) => {
                      const isSelected = selectedVideo?.id === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => prepareForImport(item)}
                          className={`group flex items-center justify-between gap-3 p-2.5 rounded-lg border transition cursor-pointer ${
                            isSelected
                              ? "border-red-500/60 bg-red-500/10 shadow-sm"
                              : "border-border/60 bg-card hover:bg-accent/40 hover:border-border"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative size-14 shrink-0 rounded overflow-hidden bg-muted">
                              <img
                                src={item.thumbnail}
                                alt={item.title}
                                className="size-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-tight truncate text-foreground">
                                {item.title}
                              </p>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {item.channel}
                              </p>
                            </div>
                          </div>

                          <Button
                            size="sm"
                            variant={isSelected ? "default" : "outline"}
                            className="shrink-0 text-xs h-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              prepareForImport(item);
                            }}
                          >
                            <Download className="size-3.5 mr-1" />
                            {isSelected ? "Selected" : "Select"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Metadata Customization & Import Execution */}
        <div className="space-y-6 lg:col-span-5">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Music className="size-5 text-primary" />
                Track Metadata & Import
              </CardTitle>
              <CardDescription>
                Review and customize metadata before saving to MEVO.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {!selectedVideo ? (
                <div className="flex flex-col items-center justify-center p-8 text-center rounded-lg border border-dashed border-border/70 text-muted-foreground">
                  <Youtube className="size-10 mb-2 opacity-40 text-red-500" />
                  <p className="text-sm font-medium">No video selected</p>
                  <p className="text-xs mt-1 max-w-xs">
                    Search above or paste a YouTube link to configure and import audio.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Selected Video Preview Card */}
                  <div className="flex items-center gap-3 p-3 rounded-lg border border-border/80 bg-muted/30">
                    <img
                      src={selectedVideo.thumbnail}
                      alt={selectedVideo.title}
                      className="size-16 rounded object-cover shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-primary truncate">
                        YouTube ID: {selectedVideo.id}
                      </p>
                      <p className="text-sm font-medium truncate mt-0.5">{selectedVideo.title}</p>
                      <a
                        href={`https://www.youtube.com/watch?v=${selectedVideo.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground mt-1"
                      >
                        Watch on YouTube <ExternalLink className="size-3" />
                      </a>
                    </div>
                  </div>

                  {/* Form Fields */}
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Song Title *</label>
                      <Input
                        value={selectedVideo.title}
                        onChange={(e) =>
                          setSelectedVideo({ ...selectedVideo, title: e.target.value })
                        }
                        placeholder="Song Title"
                        disabled={importing}
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Artist / Singer *</label>
                      <Input
                        value={selectedVideo.artist}
                        onChange={(e) =>
                          setSelectedVideo({ ...selectedVideo, artist: e.target.value })
                        }
                        placeholder="Artist Name"
                        disabled={importing}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Album (Optional)</label>
                        <Input
                          value={selectedVideo.album}
                          onChange={(e) =>
                            setSelectedVideo({ ...selectedVideo, album: e.target.value })
                          }
                          placeholder="Single / Album"
                          disabled={importing}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Genre</label>
                        <Input
                          value={selectedVideo.genre}
                          onChange={(e) =>
                            setSelectedVideo({ ...selectedVideo, genre: e.target.value })
                          }
                          placeholder="Pop / Rock / Acoustic"
                          disabled={importing}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Mevo Section *</label>
                      <SectionSelect
                        value={selectedVideo.section}
                        onChange={(sec) =>
                          setSelectedVideo({ ...selectedVideo, section: sec })
                        }
                      />
                    </div>
                  </div>

                  {/* Import Progress Display */}
                  {importing && (
                    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium flex items-center gap-1.5">
                          <LoaderCircle className="size-3.5 animate-spin text-primary" />
                          {stageDetail || "Importing track..."}
                        </span>
                        <span className="text-muted-foreground">{importProgress}%</span>
                      </div>
                      <Progress value={importProgress} className="h-2" />
                    </div>
                  )}

                  {/* Action Button */}
                  <Button
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-medium shadow-md transition-all"
                    onClick={handleExecuteImport}
                    disabled={
                      importing ||
                      !selectedVideo.title.trim() ||
                      !selectedVideo.artist.trim() ||
                      backendStatus === "offline"
                    }
                  >
                    {importing ? (
                      <>
                        <LoaderCircle className="size-4 animate-spin mr-2" />
                        Extracting & Importing...
                      </>
                    ) : (
                      <>
                        <Download className="size-4 mr-2" />
                        Import to MEVO
                      </>
                    )}
                  </Button>

                  {backendStatus === "offline" && (
                    <p className="text-xs text-red-500 text-center">
                      Cannot import while Python extractor is offline.
                    </p>
                  )}
                </div>
              )}

              {/* Success Card */}
              {importedSong && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-emerald-500 font-semibold text-sm">
                    <CheckCircle2 className="size-4" />
                    Track Successfully Imported!
                  </div>
                  <div className="flex items-center gap-3">
                    {importedSong.cover_image && (
                      <img
                        src={importedSong.cover_image}
                        alt={importedSong.title}
                        className="size-12 rounded object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {importedSong.title}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {importedSong.artist} • {importedSong.section}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => handlePlayNow(importedSong)}
                    >
                      <Play className="size-3 mr-1" /> Play Now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 text-xs"
                      onClick={() => onManageSong(importedSong.id)}
                    >
                      Manage Song
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
