import { useEffect, useRef, memo } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { DisplaySection, NavigationSource, QueueSource, Song } from "@/data/songs";

import { SongCard } from "./song-card";
import { SeeAllLink } from "./see-all-link";

function getSectionQueueSource(section: DisplaySection): QueueSource {
  if (section.id === "trending") {
    return {
      type: "trending",
      id: "trending",
      title: section.title,
    };
  }

  if (section.id === "recently-played") {
    return {
      type: "recent",
      id: "recently-played",
      title: section.title,
    };
  }

  if (
    section.id === "favourite" ||
    section.slug === "mahis-favourite" ||
    section.slug === "mahi-select" ||
    section.title === "Mahi Select"
  ) {
    return {
      type: "section",
      id: "mahi-select",
      title: "Mahi Select",
    };
  }

  return {
    type: "section",
    id: section.id,
    title: section.title,
  };
}

/**
 * Homepage থেকে song open করার source
 *
 * Scroll restore global ভাবে (route URL এর উপর ভিত্তি করে) handle হয়,
 * তাই এখানে hash/path কিছুই save করার দরকার নেই — শুধু NavigationSource
 * এর নিজের known fields ব্যবহার করছি।
 */
function getHomepageNavigationSource(section: DisplaySection): NavigationSource {
  return {
    ...getSectionQueueSource(section),
    pathname: "/",
    label: section.title,
  };
}

function SectionRowComponent({ section, songs }: { section: DisplaySection; songs: Song[] }) {
  const scroller = useRef<HTMLDivElement>(null);

  // Force layout recalculation and scroll repaint after page navigation completes
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    const raf = requestAnimationFrame(() => {
      void el.offsetHeight;
      el.dispatchEvent(new Event("scroll"));
    });

    const timer = setTimeout(() => {
      void el.offsetHeight;
      el.dispatchEvent(new Event("scroll"));
    }, 320);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [section.id]);

  const scrollBy = (direction: 1 | -1) => {
    const scrollAmount = typeof window !== "undefined" && window.innerWidth >= 1024 ? 680 : 460;
    scroller.current?.scrollBy({
      left: direction * scrollAmount,
      behavior: "smooth",
    });
  };

  if (songs.length === 0) {
    return null;
  }

  const queueSource = getSectionQueueSource(section);

  const navigationSource = getHomepageNavigationSource(section);

  return (
    <section
      id={section.id}
      className="relative scroll-mt-28 py-2 sm:py-6 lg:py-8 max-w-7xl mx-auto"
      aria-labelledby={`${section.id}-heading`}
    >
      <header className="mb-1.5 flex flex-wrap items-end justify-between gap-2 px-3 sm:mb-4 lg:mb-5 sm:gap-4 sm:px-6 md:px-12">
        <div>
          <div className="flex items-center gap-2">
            <h2
              id={`${section.id}-heading`}
              className="text-[17px] font-bold tracking-tight text-foreground sm:text-2xl md:text-3xl"
            >
              {section.title}
            </h2>
            {section.badge && (
              <span className="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary shadow-xs">
                {section.badge}
              </span>
            )}
          </div>
          <p className="mt-0.5 max-w-xl text-xs text-muted-foreground sm:mt-1.5 sm:text-sm">
            {section.subtitle}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SeeAllLink slug={section.slug} />

          <div className="hidden gap-2 md:flex">
            <button
              type="button"
              onClick={() => scrollBy(-1)}
              className="grid size-10 place-items-center rounded-full glass text-muted-foreground transition-colors hover:text-primary active:scale-95 cursor-pointer"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(1)}
              className="grid size-10 place-items-center rounded-full glass text-muted-foreground transition-colors hover:text-primary active:scale-95 cursor-pointer"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Carousel scroller — X-only, GPU-composited, fixed bounds, zero vertical shift */}
      <div
        ref={scroller}
        data-scroll-restore-id={section.id}
        className="carousel-track no-scrollbar min-h-[210px] sm:min-h-[250px] md:min-h-[280px] transform-gpu gap-2 px-3 scroll-px-3 sm:gap-4 sm:px-6 sm:scroll-px-6 md:px-12 md:scroll-px-12 py-2"
      >
        {songs.map((song, index) => (
          <div key={song.id} className="carousel-item">
            <SongCard
              song={song}
              collectionSongs={songs}
              collectionIndex={index}
              queueSource={queueSource}
              navigationSource={navigationSource}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

export const SectionRow = memo(SectionRowComponent);
