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
  category: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  selectors: string[];
  preferredPlacement?: "top" | "bottom" | "center";
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "search",
    category: "UNIFIED CATALOG",
    title: "Instant Music Discovery 🔍",
    description: "Search millions of tracks instantly, lossless audio tags, and zero clutter.",
    icon: Search,
    accentColor: "#00F0FF",
    selectors: [
      "#search-tour-target",
      "#search-input",
      '[data-tour="search"]',
      'button[aria-label="Search"]',
      'input[type="search"]',
    ],
    preferredPlacement: "bottom",
  },
  {
    id: "quick-picks",
    category: "CURATED FOR YOU",
    title: "Dynamic Quick Picks ✨",
    description: "Smart acoustic algorithms analyze your daily taste to curate tailored mixes.",
    icon: Wand2,
    accentColor: "#A855F7",
    selectors: [
      '[data-tour="quick-picks-header"]',
      "#quick-picks-section",
      '[data-tour="quick-picks"]',
      'section[data-section="quick-picks"]',
    ],
    preferredPlacement: "bottom",
  },
  {
    id: "custom-albums",
    category: "PERSONAL ARCHIVE",
    title: "Seamless Custom Albums 📁",
    description:
      "Organize your music identity. Build custom playlists with dedicated queue locking for non-stop sessions.",
    icon: FolderHeart,
    accentColor: "#F59E0B",
    selectors: [
      "#mobile-custom-albums-nav",
      "#custom-albums-nav",
      '[data-tour="custom-albums"]',
      'a[href="/albums"]',
    ],
    preferredPlacement: "bottom",
  },
  {
    id: "mahi-select",
    category: "HI-RES MASTERING",
    title: "Studio-Grade Master Feeds ⭐",
    description:
      "Bypass standard compression. Stream directly through dedicated, ultra-low-latency high-speed audio pipelines.",
    icon: Disc3,
    accentColor: "#2DD4BF",
    selectors: [
      '[data-tour="mahi-select-header"]',
      "#mahi-select-section",
      '[data-tour="mahi-select"]',
      'section[data-section="mahi-select"]',
      'section[data-section="favourite"]',
    ],
    preferredPlacement: "top",
  },
  {
    id: "lyrics",
    category: "SUB-BEAT SYNC",
    title: "Beat-Synced Karaoke Lyrics 🎙️",
    description:
      "Feel every word in real-time. Perfectly synced micro-animations pulse effortlessly alongside every drop and rhythm.",
    icon: Mic2,
    accentColor: "#EC4899",
    selectors: [
      "#lyrics-trigger-btn",
      '[data-tour="lyrics"]',
      "#beat-chick-card",
      "#bottom-player",
    ],
    preferredPlacement: "top",
  },
  {
    id: "downloads",
    category: "STUDIO VAULT",
    title: "Studio-Quality Offline Vault 📥",
    description:
      "Authorize your hardware once to unlock high-bitrate, uncompressed local playback anywhere, anytime.",
    icon: Download,
    accentColor: "#10B981",
    selectors: [
      "#mobile-downloads-nav",
      "#downloads-nav",
      '[data-tour="downloads"]',
      'a[href="/downloads"]',
      "#download-button",
    ],
    preferredPlacement: "top",
  },
];

/**
 * Robust element visibility check that doesn't falsely reject position: fixed elements
 */
function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findElementBySelectors(selectors: string[]): HTMLElement | null {
  if (typeof document === "undefined") return null;

  for (const selector of selectors) {
    try {
      if (selector.startsWith("text:")) {
        const query = selector.slice(5).toLowerCase();
        const candidates = document.querySelectorAll("h1, h2, h3, h4, span, button, a, p");
        for (const candidate of candidates) {
          const text = candidate.textContent?.trim().toLowerCase() || "";
          if (text.includes(query)) {
            const container =
              (candidate.closest("section, article, div.group, a, button") as HTMLElement) ||
              (candidate as HTMLElement);
            if (isElementVisible(container)) {
              return container;
            }
          }
        }
      } else {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          if (el instanceof HTMLElement && isElementVisible(el)) {
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

  const elevatedElementRef = useRef<HTMLElement | null>(null);
  const originalStylesRef = useRef<{
    position: string;
    zIndex: string;
  } | null>(null);
  const isUpdatingRef = useRef(false);

  // Restore elevated element back to its natural inline styles
  const restoreElevatedElement = useCallback(() => {
    if (elevatedElementRef.current && originalStylesRef.current) {
      elevatedElementRef.current.style.position = originalStylesRef.current.position;
      elevatedElementRef.current.style.zIndex = originalStylesRef.current.zIndex;
      elevatedElementRef.current = null;
      originalStylesRef.current = null;
    }
  }, []);

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

  // 4. Initial Check on Mount & broadcast tour lifecycle events
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const completed = window.localStorage.getItem(TOUR_STORAGE_KEY);
      if (!completed) {
        const timer = setTimeout(() => {
          setIsVisible(true);
        }, 600);
        return () => clearTimeout(timer);
      }
    } catch {}

    const handleStartTour = () => {
      setCurrentStepIndex(0);
      setIsVisible(true);
    };
    window.addEventListener("mevo-start-tour", handleStartTour);
    return () => window.removeEventListener("mevo-start-tour", handleStartTour);
  }, []);

  // Broadcast tour active / inactive events for components like BottomPlayer & Navbar
  useEffect(() => {
    if (isVisible) {
      window.dispatchEvent(new Event("mevo-tour-active"));
    } else {
      window.dispatchEvent(new Event("mevo-tour-inactive"));
      window.dispatchEvent(new Event("mevo-close-drawer"));
      restoreElevatedElement();
    }
  }, [isVisible, restoreElevatedElement]);

  const currentStep = TOUR_STEPS[currentStepIndex];

  // 5. Resolve Target Element, Elevate, and Compute Spotlight Coordinates
  const updateTargetPosition = useCallback(() => {
    if (!isVisible || !currentStep) return;

    const isMobileViewport = window.innerWidth <= 768;
    const stepId = currentStep.id;

    // Mobile drawer coordination for navigation steps
    if (isMobileViewport) {
      if (stepId === "custom-albums" || stepId === "downloads") {
        window.dispatchEvent(new Event("mevo-open-drawer"));
      } else {
        window.dispatchEvent(new Event("mevo-close-drawer"));
      }
    }

    const checkAndPosition = () => {
      const targetEl = findElementBySelectors(currentStep.selectors);

      if (targetEl) {
        // Restore any previously elevated element if switching targets
        if (elevatedElementRef.current !== targetEl) {
          restoreElevatedElement();

          // Elevate new target element above the tour overlay (unblurred & crisp)
          elevatedElementRef.current = targetEl;
          originalStylesRef.current = {
            position: targetEl.style.position,
            zIndex: targetEl.style.zIndex,
          };

          const computed = window.getComputedStyle(targetEl);
          if (computed.position === "static") {
            targetEl.style.position = "relative";
          }
          targetEl.style.zIndex = "100001";
        }

        const rect = targetEl.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(targetEl);
        const isFixed =
          computedStyle.position === "fixed" ||
          Boolean(targetEl.closest(".fixed, [style*='fixed']"));

        const inViewport =
          rect.top >= 30 &&
          rect.bottom <= window.innerHeight - 30 &&
          rect.left >= 0 &&
          rect.right <= window.innerWidth;

        if (!inViewport && !isFixed && !isUpdatingRef.current) {
          isUpdatingRef.current = true;
          targetEl.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });

          setTimeout(() => {
            if (targetEl.isConnected) {
              setTargetRect(targetEl.getBoundingClientRect());
              setHasElementTarget(true);
            }
            isUpdatingRef.current = false;
          }, 300);
        } else {
          setTargetRect(rect);
          setHasElementTarget(true);
        }
      } else {
        restoreElevatedElement();
        setHasElementTarget(false);
        setTargetRect(null);
      }
    };

    // Small timeout if opening/closing mobile drawer
    if (isMobileViewport && (stepId === "custom-albums" || stepId === "downloads")) {
      setTimeout(checkAndPosition, 260);
    } else {
      checkAndPosition();
    }
  }, [isVisible, currentStep, restoreElevatedElement]);

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

  // Cleanly reset scroll and scroll smoothly to top of page on exit
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

  // 6. Tour Navigation Actions
  const handleNext = useCallback(() => {
    if (currentStepIndex < TOUR_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1);
    } else {
      // Complete Tour
      try {
        window.localStorage.setItem(TOUR_STORAGE_KEY, "true");
      } catch {}
      setIsVisible(false);
      restoreElevatedElement();
      scrollToTop();
    }
  }, [currentStepIndex, restoreElevatedElement, scrollToTop]);

  const handleSkip = useCallback(() => {
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, "true");
    } catch {}
    setIsVisible(false);
    restoreElevatedElement();
    scrollToTop();
  }, [restoreElevatedElement, scrollToTop]);

  // 7. Keyboard Shortcuts (Escape to Skip, Arrows/Enter to Navigate)
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

  // 8. Compute Popover Position relative to Target (or centered/bottom on mobile)
  const popoverPositionStyle = useMemo(() => {
    if (typeof window === "undefined") return {};

    // Mobile: fixed bottom-4 left-4 right-4, max-w-[calc(100vw-2rem)]
    if (isMobile || window.innerWidth < 640) {
      return {
        bottom: "1rem",
        left: "1rem",
        right: "1rem",
        margin: "0 auto",
        width: "auto",
        maxWidth: "calc(100vw - 2rem)",
        boxSizing: "border-box" as const,
      };
    }

    const cardWidth = Math.min(window.innerWidth - 32, 420);
    const cardEstimatedHeight = 270;
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
  const spotlightPad = 6;
  const spotlightStyle =
    targetRect && hasElementTarget
      ? {
          top: Math.max(0, targetRect.top - spotlightPad),
          left: Math.max(0, targetRect.left - spotlightPad),
          width: Math.min(window.innerWidth, targetRect.width + spotlightPad * 2),
          height: Math.min(window.innerHeight, targetRect.height + spotlightPad * 2),
        }
      : null;

  return (
    <AnimatePresence>
      <aside
        aria-label="MEVO Interactive Product Tour"
        className="fixed inset-0 z-[99998] overflow-hidden pointer-events-auto touch-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dynamic SVG Cutout Mask Overlay:
            Provides crisp unblurred cutout hole over active target without obscuring blur */}
        <svg
          className="fixed inset-0 w-full h-full pointer-events-none z-[99998]"
          aria-hidden="true"
        >
          <defs>
            <mask id="mevo-tour-cutout-mask">
              {/* White background: dark overlay is rendered */}
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {/* Black cutout: completely transparent cutout hole for target element */}
              {spotlightStyle && (
                <rect
                  x={spotlightStyle.left}
                  y={spotlightStyle.top}
                  width={spotlightStyle.width}
                  height={spotlightStyle.height}
                  rx="16"
                  ry="16"
                  fill="black"
                />
              )}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(9, 15, 21, 0.85)"
            mask="url(#mevo-tour-cutout-mask)"
            className="pointer-events-auto cursor-default"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          />
        </svg>

        {/* Highlight Spotlight Bounding Ring & Emerald Glow around Active Element */}
        {spotlightStyle && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{
              opacity: 1,
              scale: 1,
              top: spotlightStyle.top,
              left: spotlightStyle.left,
              width: spotlightStyle.width,
              height: spotlightStyle.height,
            }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="fixed pointer-events-none rounded-2xl border-2 border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.45),0_0_50px_rgba(16,185,129,0.2)] z-[100002]"
          >
            {/* Subtle pulsing emerald accent outline */}
            <span
              className="absolute inset-0 rounded-2xl animate-pulse pointer-events-none"
              style={{
                boxShadow: "inset 0 0 14px rgba(16,185,129,0.28)",
              }}
            />
          </motion.div>
        )}

        {/* Tour Card Popover Window */}
        <motion.div
          key={currentStep.id}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.96 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          style={popoverPositionStyle}
          onClick={(e) => e.stopPropagation()}
          className="mevo-tour-card fixed z-[100000] overflow-hidden rounded-2xl sm:rounded-3xl border border-emerald-500/30 bg-[#090f15]/92 p-4 sm:p-6 shadow-[0_25px_70px_rgba(0,0,0,0.95),0_0_40px_rgba(16,185,129,0.15)] text-white backdrop-blur-[20px] box-border pointer-events-auto max-w-[calc(100vw-2rem)]"
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

          {/* Header Row: Category Badge + Step Indicator */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 mb-2 sm:mb-3 pr-7">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {currentStep.category}
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
                Step {currentStepIndex + 1} of {TOUR_STEPS.length}
              </span>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-sm sm:text-lg font-extrabold text-white tracking-tight mb-1.5 sm:mb-2 pr-2 break-words leading-snug">
            {currentStep.title}
          </h2>

          {/* Description */}
          <p className="text-xs sm:text-sm text-white/75 leading-relaxed mb-4 sm:mb-5 break-words">
            {currentStep.description}
          </p>

          {/* Footer Controls: Step Dots & Neon Cyan/Emerald Action Button */}
          <div className="flex items-center justify-between gap-3 pt-2.5 sm:pt-3 border-t border-white/10">
            {/* Left: Step indicator dots */}
            <div className="flex items-center gap-1.5">
              {TOUR_STEPS.map((step, idx) => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setCurrentStepIndex(idx)}
                  title={`Go to step ${idx + 1}: ${step.title}`}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    idx === currentStepIndex
                      ? "w-5 sm:w-6 bg-gradient-to-r from-emerald-400 to-[#00F0FF] shadow-[0_0_10px_rgba(16,185,129,0.7)]"
                      : "w-1.5 bg-white/20 hover:bg-white/40"
                  }`}
                />
              ))}
            </div>

            {/* Right: Neon Cyan/Emerald Gradient Action Button */}
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
