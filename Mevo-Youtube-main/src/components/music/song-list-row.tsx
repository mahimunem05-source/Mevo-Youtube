import { useNavigate } from "@tanstack/react-router";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useMemo, memo, type MouseEvent } from "react";
import {
  formatTime,
  isSongExplicit,
  type NavigationSource,
  type QueueSource,
  type Song,
} from "@/data/songs";
import { usePlayer } from "@/lib/player-context";
import { useNavigationHistory } from "@/lib/navigation-history";
import { useSettings } from "@/context/SettingsContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Equalizer } from "./equalizer";
import { SongCoverImage } from "./song-cover-image";

interface SongListRowProps {
  song: Song;
  collectionSongs: Song[];
  collectionIndex: number;
  queueSource: QueueSource;
  showAlbum?: boolean;
  navigationSource?: NavigationSource;
  playbackSource?: string | null;
  isSeeAllView?: boolean;
  showIndex?: boolean;
}

function isSameQueueSource(activeSource: QueueSource | null, rowSource: QueueSource): boolean {
  return activeSource?.type === rowSource.type && activeSource.id === rowSource.id;
}

function containsSameSongs(activeQueue: Song[], collectionSongs: Song[]): boolean {
  if (activeQueue.length !== collectionSongs.length) {
    return false;
  }

  const activeIds = new Set(activeQueue.map((item) => item.id));

  return collectionSongs.every((item) => activeIds.has(item.id));
}

/**
 * Premium two-step row interaction:
 * 1. First main-row click plays the selected song from the full collection.
 * 2. Clicking that already-active row again opens Song Details.
 *
 * The separate play button always remains a play/pause control and never
 * navigates away from the current Album, Artist, or Section page.
 */
function SongListRowComponent({
  song,
  collectionSongs,
  collectionIndex,
  queueSource,
  showAlbum = true,
  navigationSource,
  playbackSource: playbackSourceProp,
  isSeeAllView = false,
  showIndex = true,
}: SongListRowProps) {
  const player = usePlayer();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const isExplicit = isSongExplicit(song);
  const isBlocked = !settings.allowExplicitContent && isExplicit;
  const rowRef = useRef<HTMLDivElement | null>(null);

  const active = player.current?.id === song.id;
  const playing = active && player.isPlaying;

  const resolvedCollectionIndex = useMemo(() => {
    if (
      collectionIndex >= 0 &&
      collectionIndex < collectionSongs.length &&
      collectionSongs[collectionIndex]?.id === song.id
    ) {
      return collectionIndex;
    }

    return collectionSongs.findIndex((item) => item.id === song.id);
  }, [collectionIndex, collectionSongs, song.id]);

  useEffect(() => {
    if (active) {
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [active]);

  const hasValidCollectionQueue =
    isSameQueueSource(player.queueSource, queueSource) &&
    containsSameSongs(player.queue, collectionSongs);

  const activeInThisCollection = active && hasValidCollectionQueue;

  const startFromCollection = () => {
    if (isBlocked) {
      toast.info("Explicit content is disabled in your Settings.");
      return;
    }
    if (resolvedCollectionIndex < 0 || collectionSongs.length === 0) {
      return;
    }

    const isMahiSelect =
      playbackSourceProp === "mahi_select" ||
      queueSource?.id === "mahi_select" ||
      queueSource?.id === "mahi-select" ||
      queueSource?.id === "mahis-favourite" ||
      queueSource?.id === "favourite" ||
      queueSource?.title === "Mahi Select" ||
      song.section === "favourite" ||
      song.category === "Mahi Select";

    const isCustom =
      playbackSourceProp === "custom_playlist" ||
      queueSource?.type === "playlist";

    const resolvedPlaybackSource = isCustom
      ? "custom_playlist"
      : isMahiSelect
        ? "mahi_select"
        : (playbackSourceProp || undefined);

    player.playFromCollection(
      collectionSongs,
      resolvedCollectionIndex,
      queueSource,
      navigationSource,
      resolvedPlaybackSource,
    );
  };

  const { recordPlayerSource } = useNavigationHistory();

  const openSongDetails = () => {
    if (isBlocked) {
      toast.info("Explicit content is disabled in your Settings.");
      return;
    }
    recordPlayerSource();
    void navigate({
      to: "/song/$songId",
      params: { songId: song.id },
    });
  };

  const handlePlayClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (isBlocked) {
      toast.info("Explicit content is disabled in your Settings.");
      return;
    }

    if (activeInThisCollection) {
      player.toggle();
      return;
    }

    startFromCollection();
  };

  const handleMainRowClick = () => {
    if (isBlocked) {
      toast.info("Explicit content is disabled in your Settings.");
      return;
    }

    if (activeInThisCollection) {
      openSongDetails();
      return;
    }

    startFromCollection();
  };

  const playLabel = playing ? `Pause ${song.title}` : `Play ${song.title}`;
  const rowLabel = activeInThisCollection ? `Open ${song.title} details` : `Play ${song.title}`;

  return (
    <div
      ref={rowRef}
      className={cn(
        "song-row-item group flex items-center gap-3 rounded-2xl p-2 transition-colors",
        active ? "glass-row-active" : "glass-row hover:bg-white/[0.04]",
        isBlocked && "opacity-50 grayscale-[30%]",
      )}
    >
      {/* Left Serial Index / Play Button */}
      {showIndex && !isSeeAllView ? (
        <button
          type="button"
          aria-label={playLabel}
          title={playLabel}
          onClick={handlePlayClick}
          className="size-8 sm:size-9 shrink-0 grid place-items-center rounded-xl text-xs text-muted-foreground transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
        >
          {playing ? (
            <Equalizer />
          ) : (
            <>
              <span className="font-mono text-xs font-semibold text-emerald-400/80 group-hover:hidden select-none">
                #{collectionIndex + 1}
              </span>
              <Play className="hidden size-4 fill-current text-emerald-400 group-hover:block" />
            </>
          )}
        </button>
      ) : !isSeeAllView ? (
        <button
          type="button"
          aria-label={playLabel}
          title={playLabel}
          onClick={handlePlayClick}
          className="hidden size-9 shrink-0 place-items-center rounded-xl text-xs text-muted-foreground transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid"
        >
          {playing ? <Equalizer /> : <Play className="hidden size-4 group-hover:block" />}
        </button>
      ) : null}

      <button
        type="button"
        aria-label={rowLabel}
        title={rowLabel}
        onClick={handleMainRowClick}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {isSeeAllView && (
          <span className="w-6 shrink-0 text-center font-mono text-sm font-bold text-teal-400">
            {playing ? <Equalizer /> : String(collectionIndex + 1).padStart(2, "0")}
          </span>
        )}

        <div
          className={cn(
            "relative size-11 shrink-0 overflow-hidden",
            isSeeAllView ? "rounded-full border border-white/10" : "rounded-xl",
          )}
        >
          <SongCoverImage
            src={song.cover}
            alt=""
            width={44}
            height={44}
            className="size-full object-cover"
          />
        </div>

        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "flex items-center gap-1.5 truncate text-sm font-semibold",
              active && "text-primary",
            )}
          >
            <span className="truncate">{song.title}</span>
            {isExplicit && (
              <span className="shrink-0 rounded bg-white/10 px-1 py-0.2 text-[9px] font-bold text-zinc-400">
                E
              </span>
            )}
          </span>

          <span className="block truncate text-xs text-muted-foreground">
            {song.artist}
            {showAlbum && song.album ? ` · ${song.album}` : ""}
          </span>
        </span>

        <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
          {formatTime(song.duration)}
        </span>
      </button>

      <button
        type="button"
        aria-label={playLabel}
        title={playLabel}
        onClick={handlePlayClick}
        className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
    </div>
  );
}

export const SongListRow = memo(SongListRowComponent);
