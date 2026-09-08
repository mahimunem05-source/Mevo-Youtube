import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Lock,
  ShieldCheck,
  Smartphone,
  Laptop,
  Globe,
  LoaderCircle,
  X,
  Sparkles,
  Download,
  Clock,
} from "lucide-react";
import { useDeviceAccess } from "@/context/DeviceContext";

interface RequestDownloadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  songTitle?: string;
}

export function RequestDownloadModal({
  open,
  onOpenChange,
  songTitle,
}: RequestDownloadModalProps) {
  const { deviceId, deviceName, requestAccess, isLoading } = useDeviceAccess();
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSendRequest = async () => {
    setSubmitting(true);
    try {
      const ok = await requestAccess();
      if (ok) {
        onOpenChange(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isMobile =
    deviceName.toLowerCase().includes("mobile") ||
    deviceName.toLowerCase().includes("android") ||
    deviceName.toLowerCase().includes("iphone");

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !submitting && onOpenChange(false)}
          className="fixed inset-0 bg-black/80 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#0f171a] p-6 shadow-[0_25px_60px_rgba(0,0,0,0.8)] text-white z-10"
        >
          {/* Ambient Cyan Glow in Corner */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-[#00F0FF]/15 blur-3xl"
          />

          {/* Close button */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="absolute top-4 right-4 grid size-8 place-items-center rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="size-4" />
          </button>

          {/* Header Icon */}
          <div className="flex items-center gap-3 mb-4">
            <div className="grid size-12 place-items-center rounded-2xl bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/25 shadow-[0_0_20px_rgba(0,240,255,0.2)]">
              <Lock className="size-6 text-[#00F0FF]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Request MEVO for Download
              </h2>
              <span className="text-[11px] font-semibold text-[#00F0FF] flex items-center gap-1 uppercase tracking-wider">
                <Sparkles className="size-3" />
                Device-Level Access
              </span>
            </div>
          </div>

          {/* Subtitle / Description */}
          <p className="text-xs text-white/70 leading-relaxed mb-4">
            Submit a request to unlock full-quality MP3 downloads on this device. Once approved by an admin, all download buttons across the entire website will unlock automatically.
          </p>

          {/* Requested Track / Access Info Card */}
          <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-3 flex items-start gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-[#00F0FF]/10 text-[#00F0FF] shrink-0 mt-0.5 border border-[#00F0FF]/20">
              <Download className="size-4 text-[#00F0FF]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                  Requested Track
                </span>
                <span className="bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/20 text-xs px-2 py-0.5 rounded-full font-medium">
                  Unlocks All Songs
                </span>
              </div>
              <p className="text-xs font-bold text-white truncate">
                {songTitle || "Full Website Music Access"}
              </p>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                Once this request is approved, download access will automatically unlock for ALL songs across the entire website on this device.
              </p>
            </div>
          </div>

          {/* Device Summary Card */}
          <div className="mb-6 rounded-2xl border border-white/10 bg-black/40 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/50 flex items-center gap-1.5">
                {isMobile ? (
                  <Smartphone className="size-3.5 text-emerald-400" />
                ) : (
                  <Laptop className="size-3.5 text-cyan-400" />
                )}
                Hardware
              </span>
              <span className="font-semibold text-white/90 text-right truncate max-w-[200px]">
                {deviceName || "Web Client"}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs border-t border-white/5 pt-2">
              <span className="text-white/50 flex items-center gap-1.5">
                <Globe className="size-3.5 text-purple-400" />
                Device ID
              </span>
              <span className="font-mono text-[11px] text-white/60 truncate max-w-[180px]">
                {deviceId ? `${deviceId.slice(0, 14)}...` : "Generating..."}
              </span>
            </div>
          </div>

          {/* Pending Notice if already submitted */}
          {status === "pending" && (
            <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300/90 leading-relaxed">
              Your request is currently awaiting admin approval. Once approved, downloads will unlock automatically on this device.
            </div>
          )}

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="px-4 py-2 rounded-full border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white/80 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {status === "pending" ? "Close" : "Cancel"}
            </button>

            {status === "pending" ? (
              <div className="flex items-center gap-2 px-5 py-2 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold">
                <Clock className="size-3.5 animate-pulse" />
                Request Pending Approval
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void handleSendRequest()}
                disabled={submitting || isLoading}
                className="flex items-center gap-2 px-5 py-2 rounded-full bg-[#00F0FF] hover:bg-[#00F0FF]/90 text-black text-xs font-extrabold shadow-[0_0_20px_rgba(0,240,255,0.35)] transition-all disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <>
                    <LoaderCircle className="size-3.5 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="size-3.5 stroke-[2.5]" />
                    Send Request
                  </>
                )}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default RequestDownloadModal;
