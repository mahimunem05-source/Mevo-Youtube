import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { LoaderCircle, Music2, ChevronRight, Check } from "lucide-react";
import { useMusicLibrary } from "@/hooks/useMusicLibrary";
import { SongCoverImage } from "@/components/music/song-cover-image";
import { PageHeader } from "@/components/music/page-header";

export const Route = createFileRoute("/artists")({
  head: () => ({
    meta: [
      {
        title: "Artists — MEVO",
      },
      {
        name: "description",
        content: "Explore the artists shaping the MEVO catalogue.",
      },
      {
        property: "og:title",
        content: "Artists — MEVO",
      },
      {
        property: "og:description",
        content: "Explore the artists shaping the MEVO catalogue.",
      },
    ],
  }),
  component: ArtistsPage,
});

function getArtistInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return initials || "♪";
}

function ArtistsPage() {
  const [showAllArtists, setShowAllArtists] = useState(false);
  const { artists, isLoading, error: loadError } = useMusicLibrary();

  const displayedArtists = useMemo(() => {
    return showAllArtists ? artists : artists.slice(0, 15);
  }, [artists, showAllArtists]);

  const featuredArtists = useMemo(() => {
    return artists.slice(0, 12);
  }, [artists]);

  return (
    <div className="pb-24">
      {/* Header Block: PEOPLE / Artists */}
      <PageHeader
        eyebrow="People"
        title="Artists"
        subtitle="From Dhaka rooftops to global charts — the voices behind the catalogue."
      />

      <div className="mx-auto max-w-6xl px-4 sm:px-6 md:px-12 space-y-8">
        {isLoading && artists.length === 0 && (
          <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground py-8">
            <LoaderCircle className="size-5 animate-spin text-primary" />
            Loading catalogue artists...
          </div>
        )}

        {loadError && artists.length === 0 && (
          <p className="text-sm text-red-500" role="alert">
            {loadError}
          </p>
        )}

        {!isLoading && artists.length === 0 && (
          <div className="rounded-3xl glass p-10 text-center">
            <Music2 className="mx-auto mb-3 size-8 text-muted-foreground" />
            <p className="font-semibold text-white">No artists found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Stream tracks on the homepage to auto-generate artists dynamically.
            </p>
          </div>
        )}

        {artists.length > 0 && (
          <>
            {/* 1. HORIZONTALLY SCROLLABLE FEATURED ARTISTS (Circular Avatars) */}
            <section aria-label="Featured Artists">
              <div className="carousel-track no-scrollbar flex items-center gap-4 sm:gap-6 py-2 overflow-x-auto">
                {featuredArtists.map((artist) => (
                  <motion.div
                    key={`featured-${artist.slug}`}
                    whileTap={{ scale: 0.96 }}
                    className="carousel-item flex flex-col items-center text-center shrink-0 w-24 sm:w-28"
                  >
                    <Link
                      to="/artist/$artistSlug"
                      params={{ artistSlug: artist.slug }}
                      className="group flex flex-col items-center focus:outline-none"
                    >
                      <div className="relative mb-2">
                        {/* Circular Image Container */}
                        <div
                          className={`
                            relative size-20 sm:size-24 rounded-full overflow-hidden border-2 transition-all duration-300
                            ${artist.is_verified ? "border-[#4FD1C5] shadow-[0_0_20px_rgba(79,209,197,0.35)]" : "border-white/10 group-hover:border-white/30"}
                          `}
                        >
                          {artist.cover ? (
                            <SongCoverImage
                              src={artist.cover}
                              alt={`${artist.name} portrait`}
                              width={400}
                              height={400}
                              loading="eager"
                              decoding="auto"
                              className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center bg-[#182227] text-lg font-bold text-teal-400">
                              {getArtistInitials(artist.name)}
                            </div>
                          )}
                        </div>

                        {/* Verified Teal Badge */}
                        {artist.is_verified && (
                          <div
                            title="Verified Artist"
                            className="absolute bottom-0 right-0 grid size-6 place-items-center rounded-full bg-[#4FD1C5] text-[#071012] border-2 border-[#0B1012] shadow-sm"
                          >
                            <Check className="size-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      {/* Artist Name & Track Count */}
                      <span className="truncate w-full text-xs sm:text-sm font-semibold text-white group-hover:text-teal-400 transition-colors">
                        {artist.name}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground mt-0.5">
                        {artist.tracks.length} {artist.tracks.length === 1 ? "Track" : "Tracks"}
                      </span>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </section>

            {/* 2. ALL ARTISTS SECTION (Ranked List) */}
            <section aria-labelledby="all-artists-heading" className="space-y-3">
              <div className="flex items-center justify-between">
                <h2
                  id="all-artists-heading"
                  className="font-display text-lg font-bold text-white sm:text-xl"
                >
                  All Artists ({artists.length})
                </h2>
                {artists.length > 15 && (
                  <button
                    type="button"
                    onClick={() => setShowAllArtists((prev) => !prev)}
                    className="text-xs font-semibold text-teal-400 hover:text-teal-300 flex items-center gap-0.5 cursor-pointer transition-colors focus:outline-none"
                  >
                    {showAllArtists ? "Show Less" : `See All (${artists.length})`}{" "}
                    <ChevronRight
                      className={`size-3.5 transition-transform ${showAllArtists ? "rotate-90" : ""}`}
                    />
                  </button>
                )}
              </div>

              {/* Glassmorphic Container */}
              <div className="rounded-3xl border border-white/[0.08] bg-[#182227]/80 backdrop-blur-xl p-3 sm:p-4 space-y-2">
                {displayedArtists.map((artist, idx) => {
                  const rankNumber = String(idx + 1).padStart(2, "0");
                  const previewCovers = artist.tracks
                    .map((t) => t.cover)
                    .filter(Boolean)
                    .slice(0, 4);

                  return (
                    <motion.div
                      key={`top-${artist.slug}`}
                      whileTap={{ scale: 0.99 }}
                      className="group relative flex items-center justify-between rounded-2xl p-2 sm:p-2.5 transition-colors hover:bg-white/[0.05]"
                    >
                      <Link
                        to="/artist/$artistSlug"
                        params={{ artistSlug: artist.slug }}
                        className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4 pr-3"
                      >
                        {/* Rank Number */}
                        <span className="font-mono text-sm font-extrabold text-teal-400 shrink-0 w-6">
                          {rankNumber}
                        </span>

                        {/* Circular Avatar */}
                        <div className="relative size-11 sm:size-12 shrink-0 overflow-hidden rounded-full border border-white/10">
                          {artist.cover ? (
                            <SongCoverImage
                              src={artist.cover}
                              alt=""
                              width={200}
                              height={200}
                              loading="eager"
                              decoding="auto"
                              className="size-full object-cover"
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center bg-[#182227] text-xs font-bold text-teal-400">
                              {getArtistInitials(artist.name)}
                            </div>
                          )}
                        </div>

                        {/* Artist Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h3 className="truncate text-sm font-semibold text-white group-hover:text-teal-400 transition-colors">
                              {artist.name}
                            </h3>
                            {artist.is_verified && (
                              <span
                                title="Verified Artist"
                                className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[#4FD1C5] text-[#071012]"
                              >
                                <Check className="size-2.5 stroke-[3]" />
                              </span>
                            )}
                          </div>
                          <p className="truncate text-xs text-muted-foreground mt-0.5">
                            {artist.tracks.length} {artist.tracks.length === 1 ? "Track" : "Tracks"}
                          </p>
                        </div>
                      </Link>

                      {/* Right-hand side: Album Thumbnail Preview Strip + Arrow */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="hidden sm:flex items-center gap-1">
                          {previewCovers.map((c, i) => (
                            <SongCoverImage
                              key={i}
                              src={c}
                              alt=""
                              width={80}
                              height={80}
                              loading="eager"
                              decoding="auto"
                              className="size-8 rounded-lg object-cover border border-white/10"
                            />
                          ))}
                        </div>
                        <Link
                          to="/artist/$artistSlug"
                          params={{ artistSlug: artist.slug }}
                          aria-label={`View ${artist.name}`}
                          className="grid size-8 place-items-center text-white/40 group-hover:text-white transition-colors"
                        >
                          <ChevronRight className="size-4" />
                        </Link>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
