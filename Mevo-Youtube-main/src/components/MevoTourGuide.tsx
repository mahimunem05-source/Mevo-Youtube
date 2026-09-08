import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Search,
  Wand2,
  Disc3,
  FolderHeart,
  Mic2,
  Download,
  ArrowRight,
  X,
} from "lucide-react";

export const TOUR_STORAGE_KEY = "mevo_tour_completed";

export interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  tag: string;
  selectors: string[];
  preferredPlacement?: "top" | "bottom" | "center";
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "search",
    title: "Search Millions of Songs 🔍",
    description:
      "Explore a massive library powered by a smart engine that sanitizes titles and eliminates duplicate clutter.",
    icon: Search,
    accentColor: "#38BDF8",
    tag: "Global Catalog",
    selectors: [
      "#search-input",
      'input[type="search"]',
      'input[placeholder*="search" i]',
      'input[placeholder*="song" i]',
      ".navbar-search",
      "header input",
    ],
    preferredPlacement: "bottom",
  },
  {
    id: "quick-picks",
    title: "Intelligent Quick Picks ✨",
    description:
      "Tailored to your recent listening vibe with advanced diversity filtering — no repetitive remix copies.",
    icon: Wand2,
    accentColor: "#A855F7",
    tag: "Smart Recommendations",
    selectors: [
      "#quick-picks-section",
      'section[data-section="quick-picks"]',
      "text:Quick Picks",
      "text:Made For You",
      "section:first-of-type",
    ],
    preferredPlacement: "bottom",
  },
  {
    id: "custom-albums",
    title: "Create Custom Albums 📁",
    description:
      "Organize your favorite tracks into dedicated albums. Playing an album locks the Up Next queue strictly to your custom tracks.",
    icon: FolderHeart,
    accentColor: "#F59E0B",
    tag: "User Library",
    selectors: [
      'a[href="/albums"]',
      'button[title*="Playlist" i]',
      'button[aria-label*="Playlist" i]',
      'a[href*="album"]',
      "text:Albums",
      "text:Create Playlist",
    ],
    preferredPlacement: "bottom",
  },
  {
    id: "mahi-select",
    title: "Mahi Select Collection ⭐",
    description:
      "Listen to high-fidelity studio masters running on a dedicated, isolated high-speed audio pipeline.",
    icon: Disc3,
    accentColor: "#2DD4BF",
    tag: "Lossless Streaming",
    selectors: [
      "#mahi-select-section",
      'section[data-section="mahi-select"]',
      'a[href*="favourite"]',
      'a[href*="mahi"]',
      "text:Mahi Select",
      "text:Mahi's Favourite",
      "text:Bengal Echo",
    ],
    preferredPlacement: "top",
  },
  {
    id: "lyrics",
    title: "Beat-Synced Live Lyrics 🎙️",
    description:
      "Sing along effortlessly. Lyrics scroll and pulse dynamically in exact sync with every beat.",
    icon: Mic2,
    accentColor: "#EC4899",
    tag: "Live Sync",
    selectors: [
      "#lyrics-tab",
      "#beat-chick-btn",
      'button[title*="Lyrics" i]',
      'button[aria-label*="Lyrics" i]',
      'button[title*="Beat" i]',
      ".lyrics-trigger",
      "#bottom-player",
      "footer",
    ],
    preferredPlacement: "top",
  },
  {
    id: "downloads",
    title: "HQ MP3 Downloads 📥",
    description:
      "Get one-time device approval to unlock permanent, high-bitrate offline downloads across the entire platform.",
    icon: Download,
    accentColor: "#10B981",
    tag: "Device Authorized",
    selectors: [
      "#download-button",
      'button[title*="Download" i]',
      'button[aria-label*="Download" i]',
      ".download-btn",
      'a[href="/downloads"]',
      "text:Downloads",
    ],
    preferredPlacement: "top",
  },
];

function findElementBySelectors(selectors: string[]): HTMLElement | null {
  if (typeof document === "undefined") return null;

  for (const selector of selectors) {
    try {
      if (selector.startsWith("text:")) {
        const query = selector.slice(5).toLowerCase();
        const candidates = document.querySelectorAll(
          "h1, h2, h3, h4, span, button, a, p"
        );
        for (const el of candidates) {
          const text = el.textContent?.trim().toLowerCase() || "";
          if (text.includes(query)) {
            const container = (el.closest("section, article, div.group, a, button") as HTMLElement) || (el as HTMLElement);
            if (container && container.offsetParent !== null) {
              const rect = container.getBoundingClientRect();
              if (rect.width > 0 && rect.height > 0) {
                return container;
              }
            }
          }
        }
      } else {
        const el = document.querySelector(selector);
        if (el && el instanceof HTMLElement && el.offsetParent !== null) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            return el;
          }
        }
      }
    } catch {}
  }
  return null;
}

export function MevoTourGuide() {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [hasElementTarget, setHasElementTarget] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 768 : false
  );
  const isUpdatingRef = useRef(false);

  // 1. Lock background scroll and touch interaction on body & document root when tour guide is active
  useEffect(() => {
    if (!isVisible) return;
    const originalBodyOverflow = document.body.style.overflow;
    const originalBodyTouchAction = document.body.style.touchAction;
    const originalDocOverflow = document.documentElement.style.overflow;
    const originalDocTouchAction = document.documentElement.style.touchAction;

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.touchAction = "none";

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.body.style.touchAction = originalBodyTouchAction;
      document.documentElement.style.overflow = originalDocOverflow;
      document.documentElement.style.touchAction = originalDocTouchAction;
    };
  }, [isVisible]);

  // 2. Prevent mobile touch move, dragging carousels, and rubber-banding on background
  useEffect(() => {
    if (!isVisible) return;

    const preventBackgroundInteraction = (e: TouchEvent | WheelEvent) => {
      const target = e.target as HTMLElement | null;
      // Allow touch/scroll only if inside the active tour card
      if (target && target.closest(".mevo-tour-card")) {
        return;
      }
      if (e.cancelable) {
        e.preventDefault();
      }
    };

    window.addEventListener("touchmove", preventBackgroundInteraction, { passive: false });
    window.addEventListener("wheel", preventBackgroundInteraction, { passive: false });

    return () => {
      window.removeEventListener("touchmove", preventBackgroundInteraction);
      window.removeEventListener("wheel", preventBackgroundInteraction);
    };
  }, [isVisible]);

  // 3. Mobile screen resize listener
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 4. Initial Check on Mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const completed = window.localStorage.getItem(TOUR_STORAGE_KEY);
      if (!completed) {
        // Small delay to let initial DOM layout render
        const timer = setTimeout(() => {
          setIsVisible(true);
        }, 700);
        return () => clearTimeout(timer);
      }
    } catch {}

    // Support manual re-trigger via custom event
    const handleStartTour = () => {
      setCurrentStepIndex(0);
      setIsVisible(true);
    };
    window.addEventListener("mevo-start-tour", handleStartTour);
    return () => window.removeEventListener("mevo-start-tour", handleStartTour);
  }, []);

  const currentStep = TOUR_STEPS[currentStepIndex];

  // 3. Resolve Target Element and Compute Spotlight Coordinates
  const updateTargetPosition = useCallback(() => {
    if (!isVisible || !currentStep) return;

    const targetEl = findElementBySelectors(currentStep.selectors);
    if (targetEl) {
      // Scroll into view smoothly if off-screen
      const rect = targetEl.getBoundingClientRect();
      const inViewport =
        rect.top >= 50 &&
        rect.bottom <= window.innerHeight - 50 &&
        rect.left >= 0 &&
        rect.right <= window.innerWidth;

      if (!inViewport && !isUpdatingRef.current) {
        isUpdatingRef.current = true;
        targetEl.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });
        setTimeout(() => {
          if (targetEl) {
            setTargetRect(targetEl.getBoundingClientRect());
            setHasElementTarget(true);
          }
          isUpdatingRef.current = false;
        }, 350);
      } else {
        setTargetRect(rect);
        setHasElementTarget(true);
      }
    } else {
      // Fallback if element is not rendered
      setHasElementTarget(false);
      setTargetRect(null);
    }
  }, [isVisible, currentStep]);

  useEffect(() => {
    updateTargetPosition();

    const handleResizeOrScroll = () => {
      if (isVisible) {
        updateTargetPosition();
      }
    };

    window.addEventListener("resize", handleResizeOrScroll, { passive: true });
    window.addEventListener("scroll", handleResizeOrScroll, { passive: true });

    return () => {
      window.removeEventListener("resize", handleResizeOrScroll);
      window.removeEventListener("scroll", handleResizeOrScroll);
    };
  }, [updateTargetPosition, isVisible, currentStepIndex]);

  // Helper to cleanly reset scroll and scroll smoothly to top of page
  const scrollToTop = useCallback(() => {
    if (typeof document !== "undefined") {
      document.body.style.overflow = "";
      document.body.style.touchAction = "";
      document.documentElement.style.overflow = "";
      document.documentElement.style.touchAction = "";
    }

    if (typeof window !== "undefined") {
      try {
        window.scrollTo({
          top: 0,
          left: 0,
          behavior: "smooth",
        });
      } catch {
        window.scrollTo(0, 0);
      }
      setTimeout(() => {
        if (typeof document !== "undefined") {
          if (document.documentElement) document.documentElement.scrollTop = 0;
          if (document.body) document.body.scrollTop = 0;
        }
      }, 50);
    }
  }, []);

  // 4. Tour Navigation Actions
  const handleNext = useCallback(() => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      // Complete Tour
      try {
        window.localStorage.setItem(TOUR_STORAGE_KEY, "true");
      } catch {}
      setIsVisible(false);
      scrollToTop();
    }
  }, [currentStepIndex, scrollToTop]);

  const handleSkip = useCallback(() => {
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, "true");
    } catch {}
    setIsVisible(false);
    scrollToTop();
  }, [scrollToTop]);

  // 5. Keyboard Shortcuts (Escape to Skip, Arrows/Enter to Navigate)
  useEffect(() => {
    if (!isVisible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleSkip();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        handleNext();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isVisible, handleNext, handleSkip]);

  // 6. Compute Popover Position relative to Target (or centered/bottom on mobile)
  const popoverPositionStyle = useMemo(() => {
    if (typeof window === "undefined") return {};

    // Mobile: fixed bottom center, constrained cleanly within screen margins
    if (isMobile) {
      return {
        bottom: "1.5rem",
        left: "1rem",
        right: "1rem",
        margin: "0 auto",
        width: "calc(100% - 2rem)",
        maxWidth: "28rem",
        boxSizing: "border-box" as const,
      };
    }

    const cardWidth = Math.min(window.innerWidth - 32, 420);
    const cardEstimatedHeight = 260;
    const margin = 16;

    if (!hasElementTarget || !targetRect) {
      // Centered on desktop screen
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: `${cardWidth}px`,
        boxSizing: "border-box" as const,
      };
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Horizontal centering relative to target with viewport clamping
    let left = targetRect.left + targetRect.width / 2 - cardWidth / 2;
    if (left < margin) left = margin;
    if (left + cardWidth > vw - margin) left = vw - cardWidth - margin;

    // Determine whether to place above or below
    const spaceBelow = vh - targetRect.bottom;
    const spaceAbove = targetRect.top;
    const placeTop =
      currentStep.preferredPlacement === "top"
        ? spaceAbove >= cardEstimatedHeight || spaceAbove > spaceBelow
        : spaceBelow < cardEstimatedHeight && spaceAbove >= cardEstimatedHeight;

    let top: number;
    if (placeTop) {
      top = Math.max(margin, targetRect.top - cardEstimatedHeight - 12);
    } else {
      top = Math.min(vh - cardEstimatedHeight - margin, targetRect.bottom + 12);
    }

    return {
      top: `${top}px`,
      left: `${left}px`,
      width: `${cardWidth}px`,
      boxSizing: "border-box" as const,
    };
  }, [isMobile, hasElementTarget, targetRect, currentStep]);

  if (!isVisible) return null;

  const StepIcon = currentStep.icon;
  const isLastStep = currentStepIndex === TOUR_STEPS.length - 1;

  // Spotlight Box coordinates with padding
  const spotlightPad = 8;
  const spotlightStyle = targetRect && hasElementTarget
    ? {
        top: Math.max(0, targetRect.top - spotlightPad),
        left: Math.max(0, targetRect.left - spotlightPad),
        width: targetRect.width + spotlightPad * 2,
        height: targetRect.height + spotlightPad * 2,
      }
    : null;

  return (
    <AnimatePresence>
      <aside
        aria-label="MEVO Interactive Product Tour"
        className="fixed inset-0 z-[99998] overflow-hidden pointer-events-auto touch-none"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Dim Backdrop with Cutout or Solid Overlay - Blocks all background clicks without dismissing */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="fixed inset-0 bg-black/75 backdrop-blur-[6px] cursor-default select-none touch-none pointer-events-auto z-[99998]"
        />

        {/* Highlight Spotlight Bounding Box around Active Element */}
        {spotlightStyle && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{
              opacity: 1,
              scale: 1,
              top: spotlightStyle.top,
              left: spotlightStyle.left,
              width: spotlightStyle.width,
              height: spotlightStyle.height,
            }}
            transition={{ type: "spring", damping: 25, stiffness: 220 }}
            className="fixed pointer-events-none rounded-2xl border-2 border-[#00F0FF] shadow-[0_0_35px_rgba(0,240,255,0.45),inset_0_0_20px_rgba(0,240,255,0.2)] z-[99998]"
          />
        )}

        {/* Tour Card Popover Window */}
        <motion.div
          key={currentStep.id}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          style={popoverPositionStyle}
          onClick={(e) => e.stopPropagation()}
          className="mevo-tour-card fixed z-[99999] overflow-hidden rounded-3xl border border-emerald-500/35 bg-[#0d1117]/95 p-4 sm:p-6 shadow-[0_25px_70px_rgba(0,0,0,0.95),0_0_40px_rgba(16,185,129,0.15)] text-white backdrop-blur-[20px] box-border pointer-events-auto"
        >
          {/* Ambient Glow in Corner */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full blur-3xl opacity-20"
            style={{ backgroundColor: currentStep.accentColor }}
          />

          {/* Close button */}
          <button
            type="button"
            onClick={handleSkip}
            title="Close (Esc)"
            aria-label="Close Tour"
            className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 grid size-7 sm:size-8 place-items-center rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors cursor-pointer"
          >
            <X className="size-3.5 sm:size-4" />
          </button>

          {/* Header Row: MEVO New Features + Step Badge & Tag */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 mb-2.5 sm:mb-3 pr-7">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                MEVO New Features
              </span>

              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wider border"
                style={{
                  backgroundColor: `${currentStep.accentColor}15`,
                  color: currentStep.accentColor,
                  borderColor: `${currentStep.accentColor}35`,
                }}
              >
                <StepIcon className="size-2.5" />
                {currentStep.tag}
              </span>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-sm sm:text-lg font-extrabold text-white tracking-tight mb-1.5 sm:mb-2 pr-2 break-words leading-snug">
            {currentStep.title}
          </h2>

          {/* Description */}
          <p className="text-xs sm:text-sm text-white/75 leading-snug mb-4 sm:mb-5 break-words">
            {currentStep.description}
          </p>

          {/* Footer Controls: Step Dots / Counter & Emerald Gradient Action Button */}
          <div className="flex items-center justify-between gap-3 pt-2.5 sm:pt-3 border-t border-white/10">
            {/* Left: Step indicator dots and Step counter */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              <div className="flex items-center gap-1 sm:gap-1.5">
                {TOUR_STEPS.map((step, idx) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setCurrentStepIndex(idx)}
                    title={`Go to Feature ${idx + 1}: ${step.title}`}
                    className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                      idx === currentStepIndex
                        ? "w-5 sm:w-6 bg-gradient-to-r from-emerald-400 to-[#00F0FF] shadow-[0_0_10px_rgba(16,185,129,0.7)]"
                        : "w-1.5 bg-white/20 hover:bg-white/40"
                    }`}
                  />
                ))}
              </div>
              <span className="text-[10px] sm:text-[11px] font-bold text-white/50 tracking-wider uppercase">
                Step {currentStepIndex + 1} of {TOUR_STEPS.length}
              </span>
            </div>

            {/* Right: Emerald Gradient Action Button */}
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-[#00F0FF] text-black text-xs font-extrabold shadow-[0_0_20px_rgba(16,185,129,0.35)] transition-all hover:brightness-110 active:scale-95 cursor-pointer shrink-0"
            >
              {isLastStep ? (
                <>
                  <span>Get Started</span>
                  <span className="text-xs">🚀</span>
                </>
              ) : (
                <>
                  <span>Next Feature</span>
                  <ArrowRight className="size-3.5 stroke-[2.5]" />
                </>
              )}
            </button>
          </div>
        </motion.div>
      </aside>
    </AnimatePresence>
  );
}

export default MevoTourGuide;
