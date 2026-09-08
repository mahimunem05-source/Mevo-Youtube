import { motion } from "motion/react";
import { Play, Shuffle, Music2 } from "lucide-react";
import { formatTime } from "@/data/songs";
import { cn } from "@/lib/utils";
import { SongCoverImage } from "./song-cover-image";

type CollectionType = "album" | "artist" | "section" | "trending" | "recent";

interface CollectionHeaderProps {
  type: CollectionType;
  image: string | null;
  title: string;
  subtitle?: string;
  year?: number | null;
  songCount: number;
  totalDuration: number;
  onPlayAll: () => void;
  onShuffle: () => void;
  isShuffled?: boolean;
  disabled?: boolean;
}

const TYPE_LABEL: Record<CollectionType, string> = {
  album: "Album",
  artist: "Artist",
  section: "Collection",
  trending: "Trending",
  recent: "Recently Played",
};

export function CollectionHeader({
  type,
  image,
  title,
  subtitle,
  year,
  songCount,
  totalDuration,
  onPlayAll,
  onShuffle,
  isShuffled = false,
  disabled = false,
}: CollectionHeaderProps) {
  const roundImage = type === "artist";

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="
        relative
        overflow-hidden
        rounded-[32px]
        border
        border-border
        bg-card/90
        backdrop-blur-xl
        p-4
        sm:p-6
        md:p-10
        shadow-xl
      "
    >
      {/* Background glow */}
      {image && (
        <div
          className="
            absolute inset-0
            opacity-15 dark:opacity-20
            blur-3xl
            scale-110
            bg-center
            bg-cover
          "
          style={{
            backgroundImage: `url(${image})`,
          }}
        />
      )}

      <div
        aria-hidden="true"
        className="
          pointer-events-none
          absolute
          -left-32
          -top-32
          size-96
          rounded-full
          bg-primary/20 dark:bg-primary/30
          blur-[140px]
        "
      />

      {/* Subtle theme overlay */}
      <div className="absolute inset-0 bg-background/30 backdrop-blur-[2px]" />

      <div className="relative z-10 flex flex-row items-center gap-4 sm:gap-8">
        {/* Cover */}
        <div className="shrink-0">
          {image ? (
            <SongCoverImage
              src={image}
              alt={`${title} artwork`}
              width={256}
              height={256}
              loading="eager"
              decoding="auto"
              className={cn(
                `
                size-28
                sm:size-48
                md:size-64
                object-cover
                shadow-2xl
                ring-1
                ring-border
                `,
                roundImage ? "rounded-full" : "rounded-2xl sm:rounded-[28px]",
              )}
            />
          ) : (
            <div
              className="
              grid
              size-28
              sm:size-48
              md:size-64
              place-items-center
              rounded-2xl
              sm:rounded-[28px]
              bg-primary/10
              text-primary
              "
            >
              <Music2 className="size-10 sm:size-20" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1 space-y-1 sm:space-y-4">
          <p
            className="
            text-xs
            font-bold
            uppercase
            tracking-[0.35em]
            text-primary
            "
          >
            {TYPE_LABEL[type]}
          </p>

          <h1
            className="
            text-3xl
            sm:text-4xl
            md:text-6xl
            font-black
            tracking-tight
            text-foreground
            "
          >
            {title}
          </h1>

          {subtitle && (
            <p
              className="
              max-w-xl
              text-base sm:text-lg
              text-muted-foreground
            "
            >
              {subtitle}
            </p>
          )}

          <p
            className="
            text-xs sm:text-sm
            text-muted-foreground/80
          "
          >
            {songCount} {songCount === 1 ? "song" : "songs"}
            {totalDuration > 0 && ` • ${formatTime(totalDuration)}`}
            {year && ` • ${year}`}
            {type === "trending" && " • Updated daily"}
          </p>

          {/* Buttons */}
          <div className="flex flex-wrap gap-3 pt-4">
            <motion.button
              type="button"
              disabled={disabled}
              onClick={onPlayAll}
              whileHover={disabled ? undefined : { scale: 1.04, y: -2 }}
              whileTap={disabled ? undefined : { scale: 0.96 }}
              className="
                flex
                items-center
                gap-2
                rounded-full
                bg-primary
                px-5
                py-3
                sm:px-8
                sm:py-3.5
                font-semibold
                text-primary-foreground
                shadow-[0_0_24px_rgba(79,209,197,0.35)]
                cursor-pointer
              "
            >
              <Play className="size-4 fill-current" />
              Play All
            </motion.button>

            <motion.button
              type="button"
              disabled={disabled}
              onClick={onShuffle}
              aria-label={isShuffled ? "Shuffle is on" : "Shuffle is off"}
              title={isShuffled ? "Shuffle On" : "Shuffle Off"}
              whileHover={disabled ? undefined : { scale: 1.04, y: -2 }}
              whileTap={disabled ? undefined : { scale: 0.96 }}
              className={cn(
                "flex items-center gap-2 rounded-full border px-5 py-3 sm:px-8 sm:py-3.5 font-semibold cursor-pointer transition-all duration-200",
                isShuffled
                  ? "border-[#4FD1C5] bg-[#4FD1C5]/20 text-[#4FD1C5] shadow-[0_0_20px_rgba(79,209,197,0.35)] hover:bg-[#4FD1C5]/25"
                  : "border-border bg-card/80 backdrop-blur-md text-foreground hover:bg-accent",
              )}
            >
              <Shuffle
                className={cn(
                  "size-4 transition-colors",
                  isShuffled ? "text-[#4FD1C5]" : "text-foreground",
                )}
              />
              <span>Shuffle</span>
            </motion.button>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
