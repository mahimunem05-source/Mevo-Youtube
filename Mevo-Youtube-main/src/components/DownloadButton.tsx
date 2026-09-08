import React, { useState } from "react";
import { Download, Check, LoaderCircle, Lock, Clock, ShieldAlert } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { Song } from "@/data/songs";
import { useDownloads } from "@/hooks/useDownloads";
import { useDeviceAccess } from "@/context/DeviceContext";
import { RequestDownloadModal } from "@/components/RequestDownloadModal";

export interface DownloadButtonProps {
  song?: Song | null;
  songId?: string;
  songTitle?: string;
  variant?: "icon" | "full" | "minimal";
  className?: string;
}

/**
 * Global Whitelist-Aware Download Button Component.
 *
 * Visual & Interaction Flow:
 * 1. Locked / Unapproved:
 *    Cyan Lock icon + "Download" label in a pill button.
 *    Clicking opens RequestDownloadModal.
 * 2. Pending Approval:
 *    Spinner or Clock icon + "Approval Pending..." text.
 * 3. Approved:
 *    Cyan Download icon + "Download" label (no text wrap, single line).
 */
export function DownloadButton({
  song,
  songId: propSongId,
  songTitle: propSongTitle,
  variant = "icon",
  className,
}: DownloadButtonProps) {
  const {
    isDownloaded,
    isDownloading,
    getProgress,
    startDownload,
    cancelDownload,
    removeDownload,
  } = useDownloads();

  const { status, isApproved, isLoading: isDeviceLoading } = useDeviceAccess();
  const [modalOpen, setModalOpen] = useState(false);

  // Resolve song metadata
  const effectiveId = song?.id || propSongId || "";
  const effectiveTitle = song?.title || propSongTitle || "Track";

  const downloaded = effectiveId ? isDownloaded(effectiveId) : false;
  const downloading = effectiveId ? isDownloading(effectiveId) : false;
  const progress = effectiveId ? getProgress(effectiveId) : 0;

  if (!effectiveId) {
    return null;
  }

  // Handle Button Click Action
  const handleAction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // If device is not yet approved, open the confirmation modal
    if (!isApproved) {
      if (status !== "pending") {
        setModalOpen(true);
      }
      return;
    }

    // If device is approved, perform actual MP3 download
    const targetSong: Song = song || {
      id: effectiveId,
      title: effectiveTitle,
      artist: "Unknown Artist",
      album: "MEVO",
      genre: "Music",
      year: new Date().getFullYear(),
      duration: 210,
      cover: `https://img.youtube.com/vi/${effectiveId.replace(/^yt-/, "")}/hqdefault.jpg`,
      audio: "",
      section: "global",
      category: "Download",
    };

    if (downloading) {
      cancelDownload(effectiveId);
      return;
    }
    if (downloaded) {
      void removeDownload(targetSong);
      return;
    }
    void startDownload(targetSong);
  };

  // --- MINIMAL / ICON COMPACT VARIANT ---
  if (variant === "minimal" || variant === "icon") {
    if (isDeviceLoading) {
      return (
        <button
          type="button"
          disabled
          aria-label="Checking access permissions"
          className={cn(
            "grid size-9 sm:size-10 place-items-center rounded-full border border-white/10 bg-white/5 text-white/40",
            className
          )}
        >
          <LoaderCircle className="w-4 h-4 animate-spin text-[#00F0FF]" />
        </button>
      );
    }

    if (!isApproved) {
      const isPending = status === "pending";
      const isRevoked = status === "revoked";

      return (
        <>
          <motion.button
            type="button"
            onClick={handleAction}
            disabled={isPending}
            whileHover={isPending ? {} : { scale: 1.05 }}
            whileTap={isPending ? {} : { scale: 0.95 }}
            aria-label={
              isPending
                ? "Approval Pending"
                : isRevoked
                  ? "Access Revoked — Request Access"
                  : "Request Download Access"
            }
            title={
              isPending
                ? "Approval Pending"
                : isRevoked
                  ? "Access Revoked (Click to re-request)"
                  : "Download (Request Access)"
            }
            className={cn(
              "grid size-9 sm:size-10 place-items-center rounded-full border transition-all duration-200 cursor-pointer shadow-sm",
              isPending
                ? "border-amber-500/30 bg-amber-500/10 text-amber-300 cursor-not-allowed opacity-85"
                : isRevoked
                  ? "border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white",
              className
            )}
          >
            {isPending ? (
              <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
            ) : isRevoked ? (
              <ShieldAlert className="w-4 h-4 text-red-400" />
            ) : (
              <Lock className="w-4 h-4 text-[#00F0FF]" />
            )}
          </motion.button>

          <RequestDownloadModal
            open={modalOpen}
            onOpenChange={setModalOpen}
            songTitle={effectiveTitle}
          />
        </>
      );
    }

    // Approved: render active download icon
    return (
      <motion.button
        type="button"
        aria-label={downloaded ? "Remove download" : downloading ? "Cancel download" : "Download"}
        title={downloaded ? "Downloaded" : downloading ? `${progress}%` : "Download"}
        onClick={handleAction}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "grid size-9 sm:size-10 place-items-center rounded-full border transition-all duration-200 cursor-pointer shadow-sm",
          downloaded
            ? "border-[#00F0FF]/40 bg-[#00F0FF]/15 text-[#00F0FF]"
            : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white",
          className
        )}
      >
        {downloaded ? (
          <Check className="w-4 h-4 text-[#00F0FF]" />
        ) : downloading ? (
          <LoaderCircle className="w-4 h-4 animate-spin text-[#00F0FF]" />
        ) : (
          <Download className="w-4 h-4 text-[#00F0FF]" />
        )}
      </motion.button>
    );
  }

  // --- FULL / PILL BUTTON VARIANT ---

  // State 1 & 2: Not Approved (Unregistered / Pending / Revoked)
  if (!isApproved) {
    const isPending = status === "pending";
    const isRevoked = status === "revoked";

    return (
      <>
        <motion.button
          type="button"
          onClick={handleAction}
          disabled={isPending || isDeviceLoading}
          whileHover={isPending ? {} : { scale: 1.03 }}
          whileTap={isPending ? {} : { scale: 0.97 }}
          aria-label={isPending ? "Approval Pending..." : "Download"}
          title={isPending ? "Approval Pending..." : "Download (Click to request download access)"}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-sm font-medium text-white transition-colors whitespace-nowrap cursor-pointer",
            isPending && "border-amber-500/30 bg-amber-500/10 text-amber-300 cursor-not-allowed opacity-90",
            isRevoked && "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
            className
          )}
        >
          {isDeviceLoading ? (
            <LoaderCircle className="w-4 h-4 animate-spin text-[#00F0FF]" />
          ) : isPending ? (
            <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
          ) : isRevoked ? (
            <ShieldAlert className="w-4 h-4 text-red-400" />
          ) : (
            <Lock className="w-4 h-4 text-[#00F0FF]" />
          )}

          <span className="whitespace-nowrap">
            {isPending ? "Approval Pending..." : "Download"}
          </span>
        </motion.button>

        <RequestDownloadModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          songTitle={effectiveTitle}
        />
      </>
    );
  }

  // State 3: Approved Device (Active "Download" Button)
  const label = downloaded
    ? "Downloaded"
    : downloading
      ? `Downloading ${progress}%`
      : "Download";

  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={handleAction}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className={cn(
        "relative flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-sm font-medium text-white transition-colors whitespace-nowrap cursor-pointer overflow-hidden",
        downloaded && "border-[#00F0FF]/40 bg-[#00F0FF]/15 text-[#00F0FF] shadow-[0_0_15px_rgba(0,240,255,0.15)]",
        className
      )}
    >
      {downloaded ? (
        <Check className="w-4 h-4 text-[#00F0FF]" />
      ) : downloading ? (
        <LoaderCircle className="w-4 h-4 animate-spin text-[#00F0FF]" />
      ) : (
        <Download className="w-4 h-4 text-[#00F0FF]" />
      )}

      <span className="whitespace-nowrap">{label}</span>

      {downloading && (
        <span
          className="absolute inset-x-0 bottom-0 h-[2.5px] bg-[#00F0FF] transition-all duration-200"
          style={{ width: `${progress}%` }}
        />
      )}
    </motion.button>
  );
}

export default DownloadButton;
