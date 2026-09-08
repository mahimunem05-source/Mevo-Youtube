import { Skeleton } from "@/components/ui/skeleton";

/** Pixel-perfect skeleton loader for individual SongCard components with constant border radius */
export function SongCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-card/60 p-2 sm:rounded-3xl sm:p-3 ${
        compact
          ? "w-full"
          : "w-[calc((100vw-2.25rem)/3)] min-w-[104px] max-w-[128px] shrink-0 sm:w-48 md:w-56"
      }`}
    >
      {/* Cover Artwork placeholder — matches SongCard's rounded-xl sm:rounded-2xl */}
      <Skeleton className="aspect-square w-full rounded-xl sm:rounded-2xl bg-white/10" />

      {/* Song Title & Artist text placeholders */}
      <div className="mt-2 space-y-1.5 px-0.5 sm:mt-2.5">
        <Skeleton className="h-3.5 w-3/4 rounded-md bg-white/15" />
        <Skeleton className="h-3 w-1/2 rounded-md bg-white/10" />
      </div>
    </div>
  );
}

/** Pixel-perfect skeleton loader for horizontal carousel SectionRows */
export function SectionRowSkeleton({ cardsCount = 6 }: { cardsCount?: number }) {
  return (
    <div className="relative py-2 sm:py-6">
      {/* Row Header */}
      <div className="mb-2 flex items-end justify-between px-3 sm:mb-4 sm:px-6 md:px-12">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36 rounded-md bg-white/15 sm:h-7 sm:w-48 sm:rounded-lg" />
          <Skeleton className="h-3 w-48 rounded-md bg-white/10 sm:h-4 sm:w-64" />
        </div>
        <Skeleton className="h-7 w-16 rounded-full bg-white/10" />
      </div>

      {/* Track Scroller Carousel */}
      <div className="flex gap-2 overflow-hidden px-3 sm:gap-4 sm:px-6 md:px-12">
        {Array.from({ length: cardsCount }).map((_, i) => (
          <SongCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/** Pixel-perfect skeleton loader matching HeroBanner dimensions & constant rounded-2xl sm:rounded-3xl border radius */
export function HeroBannerSkeleton() {
  return (
    <div className="px-3 sm:px-6 md:px-12">
      <div
        className="relative flex min-h-[220px] items-end justify-between overflow-hidden rounded-2xl border border-white/10 p-4 sm:min-h-[280px] sm:rounded-3xl sm:p-6 md:min-h-[320px] md:p-8"
        style={{
          background:
            "linear-gradient(135deg, rgba(20, 28, 32, 0.85) 0%, rgba(12, 17, 20, 0.95) 100%)",
        }}
      >
        {/* Left Side Content Details */}
        <div className="space-y-3 sm:space-y-4">
          <Skeleton className="h-5 w-24 rounded-full bg-white/15 sm:h-6 sm:w-28" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48 rounded-md bg-white/20 sm:h-9 sm:w-72 sm:rounded-lg md:w-96" />
            <Skeleton className="h-4 w-32 rounded-md bg-white/10 sm:h-5 sm:w-48" />
          </div>
          <Skeleton className="h-10 w-28 rounded-full bg-teal-400/20 border border-teal-400/30 sm:h-12 sm:w-32" />
        </div>

        {/* Right Side Cover Preview (Desktop) — matches HeroBanner's rounded-2xl */}
        <Skeleton className="hidden h-44 w-44 rounded-2xl bg-white/10 shadow-2xl md:block md:h-52 md:w-52" />
      </div>

      {/* Pagination Indicator Dots */}
      <div className="mt-3 flex items-center justify-center gap-1.5">
        <Skeleton className="h-1.5 w-6 rounded-full bg-teal-400/50" />
        <Skeleton className="h-1.5 w-1.5 rounded-full bg-white/20" />
        <Skeleton className="h-1.5 w-1.5 rounded-full bg-white/20" />
        <Skeleton className="h-1.5 w-1.5 rounded-full bg-white/20" />
        <Skeleton className="h-1.5 w-1.5 rounded-full bg-white/20" />
      </div>
    </div>
  );
}

/** Complete Homepage Skeleton combining Hero Banner and Section Rows */
export function HomepageSkeleton() {
  return (
    <div className="space-y-6 pt-2 sm:space-y-8">
      <HeroBannerSkeleton />
      <SectionRowSkeleton />
      <SectionRowSkeleton />
      <SectionRowSkeleton />
    </div>
  );
}
