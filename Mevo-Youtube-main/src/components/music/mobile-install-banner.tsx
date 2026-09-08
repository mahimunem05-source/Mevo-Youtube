import { useEffect, useState, useCallback, memo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Download, X, Sparkles } from "lucide-react";

const DISMISS_STORAGE_KEY = "mevo-install-banner-dismissed";

export const MobileInstallBanner = memo(function MobileInstallBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Check if already installed as standalone PWA
    let isStandalone = false;
    try {
      isStandalone = Boolean(
        (window.matchMedia && window.matchMedia("(display-mode: standalone)")?.matches) ||
        (navigator as unknown as { standalone?: boolean })?.standalone ||
        (typeof document !== "undefined" && typeof document.referrer === "string" && document.referrer.includes("android-app://"))
      );
    } catch {
      isStandalone = false;
    }

    if (isStandalone) {
      setIsVisible(false);
      return;
    }

    // 2. Check if previously dismissed in this session
    try {
      if (sessionStorage.getItem(DISMISS_STORAGE_KEY) === "1") {
        setIsVisible(false);
        return;
      }
    } catch {
      // Storage unavailable in private browsing
    }

    // 3. Detect mobile device
    let isMobileDevice = false;
    try {
      const userAgent =
        (typeof navigator !== "undefined" && (navigator.userAgent || navigator.vendor)) ||
        (typeof window !== "undefined" && (window as unknown as { opera?: string }).opera) ||
        "";
      isMobileDevice =
        /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent) ||
        (typeof window !== "undefined" && window.innerWidth < 768 && "ontouchstart" in window);
    } catch {
      isMobileDevice = false;
    }

    if (!isMobileDevice) {
      setIsVisible(false);
      return;
    }

    // On mobile devices, show banner
    setIsVisible(true);
  }, []);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    try {
      sessionStorage.setItem(DISMISS_STORAGE_KEY, "1");
    } catch {
      // Ignore storage errors
    }
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="mobile-pwa-install-banner"
          initial={{ y: -60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -60, opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="sticky top-0 z-50 w-full overflow-hidden border-b border-[#4FD1C5]/20 bg-[#071114]/95 shadow-[0_4px_24px_rgba(0,0,0,0.6)] backdrop-blur-xl md:hidden"
        >
          {/* Subtle top neon ambient glow */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 h-16 w-3/4 rounded-full bg-[#4FD1C5]/15 blur-2xl"
          />

          <div className="relative mx-auto flex max-w-lg items-center justify-between gap-3 px-3 py-2 sm:px-4 sm:py-2.5">
            {/* App Icon + Information */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="relative size-9 shrink-0 overflow-hidden rounded-xl border border-[#4FD1C5]/30 bg-[#121E23] shadow-[0_0_12px_rgba(79,209,197,0.25)]">
                <img
                  src="/favicon.png"
                  alt="MEVO App Icon"
                  width={36}
                  height={36}
                  className="size-full object-cover"
                />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-extrabold tracking-tight text-white">
                    MEVO Music
                  </span>
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[#4FD1C5]/15 border border-[#4FD1C5]/30 px-1.5 py-0.2 text-[8px] font-bold text-[#4FD1C5]">
                    <Sparkles className="size-2 text-[#4FD1C5]" />
                    <span>APP</span>
                  </span>
                </div>
                <p className="truncate text-[10px] font-medium text-white/60">
                  Full-screen & native sound
                </p>
              </div>
            </div>

            {/* Actions: Install CTA + Close button */}
            <div className="flex items-center gap-1.5 shrink-0">
              <motion.a
                href="/mevo.apk"
                download="MEVO.apk"
                whileTap={{ scale: 0.94 }}
                className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#4FD1C5] to-[#38B2AC] px-3.5 py-1.5 text-xs font-bold text-[#071012] shadow-[0_2px_10px_rgba(79,209,197,0.35)] transition-all hover:brightness-110 active:brightness-95 cursor-pointer no-underline select-none"
              >
                <Download className="size-3.5 stroke-[2.5]" />
                <span>Install</span>
              </motion.a>

              <button
                type="button"
                aria-label="Dismiss app banner"
                onClick={handleDismiss}
                className="grid size-7 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
