/**
 * Global Scroll Performance Optimizer
 *
 * Tracks active document scrolling to pause or throttle intense audio-reactive
 * canvas, SVG, and CSS transform animation loops during user scroll flings.
 * Uses a single passive scroll and touchmove listener on the window.
 * Zero React re-renders. Synchronously queried inside requestAnimationFrame loops.
 */

let isScrolling = false;
let scrollTimer: number | null = null;

function onScroll() {
  isScrolling = true;

  if (scrollTimer !== null) {
    window.clearTimeout(scrollTimer);
  }

  // Once scrolling stops/idles for 100ms, restore animation updates
  scrollTimer = window.setTimeout(() => {
    isScrolling = false;
    scrollTimer = null;
  }, 100);
}

if (typeof window !== "undefined") {
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("touchmove", onScroll, { passive: true });
}

/**
 * Returns true if the user is currently scrolling/flinging the page.
 * Checked inside rAF loops to skip heavy DOM/filter writes during scroll flings.
 */
export function isUserFastScrolling(): boolean {
  return isScrolling;
}
