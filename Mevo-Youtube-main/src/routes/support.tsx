import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  AudioLines,
  Copyright,
  Search,
  ListMusic,
  MonitorSmartphone,
  FileWarning,
  Mail,
  ArrowLeft,
} from "lucide-react";
import { PageHeader } from "@/components/music/page-header";

export const Route = createFileRoute("/support")({
  head: () => ({
    meta: [
      { title: "Support — MEVO" },
      {
        name: "description",
        content: "Help with playback, audio loading, search and song information on MEVO.",
      },
      { property: "og:title", content: "Support — MEVO" },
      {
        property: "og:description",
        content: "Troubleshooting and help topics for the MEVO music player.",
      },
      { property: "og:url", content: "/support" },
    ],
    links: [{ rel: "canonical", href: "/support" }],
  }),
  component: SupportPage,
});

const topics = [
  {
    icon: <AudioLines className="size-4" />,
    title: "Music playback issues",
    body: "If a track does not start, pause and play it again, or pick another song from the queue. Playback runs in your browser, so a background tab suspended by the system can also stop audio.",
  },
  {
    icon: <MonitorSmartphone className="size-4" />,
    title: "Audio not loading",
    body: "Audio files stream from our storage. A slow or blocked connection can prevent loading — try refreshing the page, switching networks, or disabling extensions that block media.",
  },
  {
    icon: <Search className="size-4" />,
    title: "Search problems",
    body: "Search matches song titles, artists, albums and genres in the published catalogue. If something is missing, it may not be published yet.",
  },
  {
    icon: <ListMusic className="size-4" />,
    title: "Queue and recently played",
    body: "The queue follows the section you started playing from. Recently played and player preferences are kept in your browser's local storage, so clearing site data resets them.",
  },
  {
    icon: <MonitorSmartphone className="size-4" />,
    title: "Browser compatibility",
    body: "MEVO works on current versions of Chrome, Edge, Firefox and Safari on desktop and mobile. Keeping your browser updated gives the most reliable playback.",
  },
  {
    icon: <FileWarning className="size-4" />,
    title: "Incorrect song information",
    body: "Spotted a wrong title, artist or artwork? Send us the track name and what should be corrected and we will review the entry.",
  },
  {
    icon: <Copyright className="size-4" />,
    title: "Copyright concerns",
    body: "Rights holders can reach us through the contact page with details of the work, the disputed content, contact information and a good-faith statement.",
  },
];

function SupportPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Help Centre"
        title="Support"
        subtitle="Answers to the most common questions about streaming, search and the MEVO player."
      />

      <div className="mx-auto max-w-6xl px-6 md:px-12">
        <div className="h-px w-full bg-border/60" />

        <div className="grid gap-8 py-10 md:grid-cols-2">
          {topics.map((topic, index) => (
            <motion.section
              key={topic.title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.04 }}
            >
              <h2 className="flex items-center gap-3 text-sm font-semibold">
                <span className="grid size-9 place-items-center rounded-full bg-primary/15 text-primary">
                  {topic.icon}
                </span>
                {topic.title}
              </h2>
              <p className="mt-3 text-sm font-light leading-relaxed text-muted-foreground">
                {topic.body}
              </p>
            </motion.section>
          ))}
        </div>

        <div className="h-px w-full bg-border/60" />

        <div className="flex flex-col items-start justify-between gap-3 py-8 sm:flex-row sm:items-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-light text-muted-foreground transition-colors duration-300 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            <ArrowLeft className="size-4" /> Back to Home
          </Link>

          <Link
            to="/contact"
            className="inline-flex items-center gap-2 text-sm font-light text-muted-foreground transition-colors duration-300 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            <Mail className="size-4" /> Still stuck? Contact MEVO
          </Link>
        </div>
      </div>
    </div>
  );
}
