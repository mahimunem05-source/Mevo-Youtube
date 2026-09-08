import { createFileRoute } from "@tanstack/react-router";
import { LiveSearch } from "@/components/music/live-search";
import { PageHeader } from "@/components/music/page-header";

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search — MEVO" },
      { name: "description", content: "Search songs, artists, albums, and genres on MEVO." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  return (
    <div className="pb-24">
      <PageHeader
        eyebrow="Explore"
        title="Search Catalogue"
        subtitle="Find your favorite tracks, artists, albums, and genres across MEVO."
      />
      <div className="mx-auto max-w-4xl px-4 sm:px-6 md:px-12">
        <LiveSearch variant="hero" autoFocus={true} />
      </div>
    </div>
  );
}
