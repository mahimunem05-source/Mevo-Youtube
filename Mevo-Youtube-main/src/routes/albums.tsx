import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  LoaderCircle,
  Disc3,
  Clock3,
  ListMusic,
  Play,
  Sparkles,
  Disc,
  Plus,
  FolderPlus,
  Pencil,
  Trash2,
  Music2,
} from "lucide-react";

import { belongsToSection, type SectionId } from "@/data/songs";
import { useMusicLibrary } from "@/hooks/useMusicLibrary";
import { formatAlbumDuration, type AlbumGroup } from "@/lib/collection-utils";
import { PageHeader } from "@/components/music/page-header";
import { usePlayer } from "@/lib/player-context";
import { usePlaylists, getPlaylistDisplayCover, type UserPlaylist } from "@/context/PlaylistContext";
import { SongCoverImage } from "@/components/music/song-cover-image";

export const Route = createFileRoute("/albums")({
  head: () => ({
    meta: [
      {
        title: "Studio Albums & Master Tapes — MEVO",
      },
      {
        name: "description",
        content: "High-fidelity studio editions, artist EPs, and lossless master collections on MEVO.",
      },
      {
        property: "og:title",
        content: "Studio Albums & Master Tapes — MEVO",
      },
      {
        property: "og:description",
        content: "Lossless multi-track studio albums and curated artist master tapes.",
      },
    ],
  }),
  component: AlbumsPage,
});

interface AlbumFilter {
  label: string;
  sectionId: SectionId | "my-playlists" | null;
}

const ALBUM_FILTERS: AlbumFilter[] = [
  { label: "All Albums", sectionId: null },
  { label: "My Playlists", sectionId: "my-playlists" },
  { label: "Bengal Echo", sectionId: "bangla" },
  { label: "Hindi Reverie", sectionId: "hindi" },
  { label: "English Essence", sectionId: "english" },
  { label: "Mahi Edition", sectionId: "favourite" },
  { label: "Boost Aura", sectionId: "boost-aura" },
  { label: "Worldwave", sectionId: "global" },
];

function AlbumsPage() {
  const player = usePlayer();
  const { playlists, openCreatePlaylistModal, deletePlaylist } = usePlaylists();
  const [activeFilter, setActiveFilter] = useState("All Albums");
  const { albums, isLoading, error: loadError } = useMusicLibrary();

  const userPlaylistGroups: AlbumGroup[] = useMemo(() => {
    return playlists.map((p) => {
      const cover = getPlaylistDisplayCover(p) || "";
      return {
        key: `user-${p.id}`,
        name: p.name,
        slug: p.slug,
        artist: "Custom Playlist",
        cover,
        badge: "Custom Playlist",
        tracks: p.tracks,
        sectionId: "favourite" as SectionId,
        year: new Date(p.createdAt).getFullYear(),
      };
    });
  }, [playlists]);

  const allCombinedAlbums = useMemo(() => {
    return [...userPlaylistGroups, ...albums];
  }, [userPlaylistGroups, albums]);

  const filteredAlbums = useMemo(() => {
    if (activeFilter === "All Albums") {
      return allCombinedAlbums;
    }

    if (activeFilter === "My Playlists") {
      return userPlaylistGroups;
    }

    const activeSectionId =
      ALBUM_FILTERS.find((filter) => filter.label === activeFilter)?.sectionId ?? null;

    if (!activeSectionId) {
      return allCombinedAlbums;
    }

    return albums.filter((album) => {
      if (album.sectionId === activeSectionId) return true;
      return album.tracks.some((track) => belongsToSection(track, activeSectionId as SectionId));
    });
  }, [allCombinedAlbums, albums, userPlaylistGroups, activeFilter]);

  const totalTracks = useMemo(
    () => filteredAlbums.reduce((sum, album) => sum + album.tracks.length, 0),
    [filteredAlbums],
  );

  const totalDuration = useMemo(
    () =>
      filteredAlbums.reduce(
        (sum, album) => sum + album.tracks.reduce((a, t) => a + (t.duration || 0), 0),
        0,
      ),
    [filteredAlbums],
  );

  const filters = ALBUM_FILTERS.map((filter) => filter.label);

  const handlePlayAlbum = (e: React.MouseEvent, album: AlbumGroup) => {
    e.preventDefault();
    e.stopPropagation();
    if (album.tracks.length > 0) {
      const isCustom =
        album.key.startsWith("user-") ||
        album.artist === "Custom Playlist" ||
        album.badge === "Custom Playlist";

      player.playFromCollection(
        album.tracks,
        0,
        {
          type: isCustom ? "playlist" : "album",
          id: album.slug,
          title: album.name,
        },
        undefined,
        isCustom ? "custom_playlist" : undefined,
      );
    }
  };

  return (
    <div className="pb-28">
      {/* Page Title Block */}
      <PageHeader
        eyebrow="Master Tapes & Studio EPs"
        title="Albums"
        subtitle="Ultra-high fidelity studio editions, artist essentials, and multi-track lossless anthologies."
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 md:px-12 space-y-6">
        {/* Filters bar (Horizontal Scroll on Mobile) */}
        <div className="carousel-track no-scrollbar flex items-center gap-2 sm:gap-3 overflow-x-auto py-1 flex-nowrap sm:flex-wrap">
          {filters.map((item) => (
            <motion.button
              key={item}
              whileTap={{ scale: 0.96 }}
              onClick={() => setActiveFilter(item)}
              className={`
                whitespace-nowrap
                shrink-0
                rounded-full
                border
                px-4
                py-1.5
                text-xs
                font-medium
                sm:px-5
                sm:py-2
                sm:text-sm
                transition-all
                duration-200
                cursor-pointer
                ${
                  activeFilter === item
                    ? "border-emerald-500 bg-emerald-500/15 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)] font-semibold"
                    : "border-white/[0.08] bg-card/70 text-muted-foreground hover:border-white/20 hover:text-foreground"
                }
              `}
            >
              {item}
            </motion.button>
          ))}
        </div>

        {/* Apple Music / Spotify Style Studio Metrics Bar */}
        <div className="bg-[#121c1f]/80 backdrop-blur-xl border border-white/10 sm:border-teal-500/20 rounded-2xl sm:rounded-full px-3 py-2 sm:px-6 sm:py-3.5 flex items-center justify-around shadow-xl sm:shadow-2xl">
          {/* Item 1: Albums */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="grid size-7 sm:size-9 place-items-center rounded-xl sm:rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
              <Disc3 className="size-3.5 sm:size-4.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs sm:text-base font-bold text-white tracking-tight leading-tight">
                {filteredAlbums.length}
              </span>
              <span className="text-[10px] sm:text-xs font-medium text-zinc-400 uppercase tracking-wider leading-tight">
                Studio Albums
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="h-5 sm:h-7 w-[1px] bg-white/10" />

          {/* Item 2: Duration */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="grid size-7 sm:size-9 place-items-center rounded-xl sm:rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/20 shrink-0">
              <Clock3 className="size-3.5 sm:size-4.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs sm:text-base font-bold text-white tracking-tight leading-tight">
                {formatAlbumDuration(totalDuration)}
              </span>
              <span className="text-[10px] sm:text-xs font-medium text-zinc-400 uppercase tracking-wider leading-tight">
                Runtime
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="h-5 sm:h-7 w-[1px] bg-white/10" />

          {/* Item 3: Tracks */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="grid size-7 sm:size-9 place-items-center rounded-xl sm:rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0">
              <ListMusic className="size-3.5 sm:size-4.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs sm:text-base font-bold text-white tracking-tight leading-tight">
                {totalTracks}
              </span>
              <span className="text-[10px] sm:text-xs font-medium text-zinc-400 uppercase tracking-wider leading-tight">
                Lossless Tracks
              </span>
            </div>
          </div>
        </div>

        {/* Loading Indicator */}
        {isLoading && albums.length === 0 && (
          <div className="mt-12 flex items-center justify-center gap-3 text-sm text-muted-foreground py-16">
            <LoaderCircle className="size-5 animate-spin text-emerald-400" />
            Mastering album catalog...
          </div>
        )}

        {/* Error Indicator */}
        {loadError && albums.length === 0 && (
          <div className="mt-8 rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-center text-xs font-semibold text-destructive">
            {loadError}
          </div>
        )}

        {/* Studio Albums Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 pt-2">
          {/* Create Album / Playlist Card */}
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => openCreatePlaylistModal()}
            className="group relative flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-teal-500/30 bg-teal-500/[0.03] p-4 sm:p-5 text-center shadow-lg transition-all duration-300 hover:border-teal-400 hover:bg-teal-500/[0.08] hover:shadow-[0_0_25px_rgba(79,209,197,0.2)] cursor-pointer min-h-[220px]"
          >
            <div className="grid size-14 place-items-center rounded-2xl bg-teal-400/10 text-teal-300 border border-teal-400/30 transition-transform group-hover:scale-110 shadow-[0_0_15px_rgba(79,209,197,0.2)]">
              <Plus className="size-7 stroke-[2.5]" />
            </div>
            <p className="mt-4 text-xs sm:text-sm font-extrabold text-white group-hover:text-teal-300 transition-colors">
              + Create Playlist
            </p>
            <p className="mt-1 text-[11px] text-white/50 leading-snug">
              Build your own custom mix or album
            </p>
          </motion.button>

          {filteredAlbums.map((album, index) => {
              const albumRuntime = album.tracks.reduce((a, t) => a + (t.duration || 0), 0);
              const badge = album.badge || (album.tracks.length >= 6 ? "Studio Edition" : "EP");

              return (
                <motion.article
                  key={album.key || album.slug}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.35, delay: Math.min(index * 0.03, 0.2), ease: "easeOut" }}
                  whileTap={{ scale: 0.98 }}
                  className="group relative flex flex-col rounded-3xl border border-white/[0.08] bg-[#141e22]/90 p-3 sm:p-3.5 shadow-xl transition-all duration-300 hover:border-emerald-500/30 hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)] hover:-translate-y-1"
                >
                  <Link
                    to="/album/$albumSlug"
                    params={{ albumSlug: album.slug }}
                    className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring flex-1 flex flex-col"
                  >
                    {/* Vinyl Sleeve Container with Peek Effect */}
                    <div className="relative overflow-hidden rounded-2xl bg-black/40 aspect-square w-full">
                      {/* Vinyl Groove Shadow Peek in Background */}
                      <div className="absolute top-1/2 -right-3 -translate-y-1/2 size-28 rounded-full border-4 border-white/5 bg-neutral-900 shadow-inner opacity-0 transition-all duration-500 group-hover:opacity-80 group-hover:right-1">
                        <div className="grid size-full place-items-center">
                          <Disc className="size-10 text-white/20 animate-spin" style={{ animationDuration: "6s" }} />
                        </div>
                      </div>

                      {/* Main Album Artwork */}
                      <SongCoverImage
                        src={album.cover}
                        alt={`${album.name} cover`}
                        width={800}
                        height={800}
                        loading="eager"
                        decoding="auto"
                        className="relative z-10 size-full object-cover rounded-2xl transition-transform duration-500 group-hover:scale-105"
                      />

                      {/* Glass Badge Overlay */}
                      <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-black/70 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30 shadow-md">
                          <Sparkles className="size-2.5" />
                          {badge}
                        </span>
                      </div>

                      {/* Quick Play Floating Button */}
                      <button
                        type="button"
                        onClick={(e) => handlePlayAlbum(e, album)}
                        aria-label={`Play ${album.name}`}
                        className="absolute bottom-2.5 right-2.5 z-30 grid size-11 place-items-center rounded-full bg-emerald-400 text-black opacity-0 translate-y-2 shadow-2xl transition-all duration-300 group-hover:opacity-100 group-hover:translate-y-0 hover:scale-110 active:scale-95 cursor-pointer"
                      >
                        <Play className="size-5 translate-x-0.5 fill-current" />
                      </button>
                    </div>

                    {/* Album Name & Details */}
                    <div className="mt-3 flex-1 flex flex-col justify-between">
                      <div>
                        <h2 className="line-clamp-1 text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">
                          {album.name}
                        </h2>
                        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground font-medium">
                          {album.artist}
                        </p>
                      </div>

                      {/* Studio Metadata Footer */}
                      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground/80 pt-1 border-t border-white/[0.04]">
                        <span className="font-semibold text-emerald-400/90">
                          {album.tracks.length} {album.tracks.length === 1 ? "track" : "tracks"}
                        </span>
                        <span>{formatAlbumDuration(albumRuntime)}</span>
                      </div>
                    </div>
                  </Link>
                </motion.article>
              );
            })}
          </div>
      </div>
    </div>
  );
}
