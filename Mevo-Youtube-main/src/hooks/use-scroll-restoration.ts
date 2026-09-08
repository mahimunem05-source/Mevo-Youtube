import { useEffect, useRef } from "react";

/**
 * Generic, route-agnostic scroll restoration.
 *
 * Mount this ONCE at the app root (see __root.tsx). It never knows about
 * "trending", "favourite", "bangla beats" or any other section — it just
 * remembers scroll position per exact URL (pathname + search + hash), and
 * per horizontally-scrolling container inside that URL.
 *
 * Navigation is detected via the raw History API (popstate + patched
 * pushState/replaceState) instead of any router-specific hook. This is
 * intentional: it makes the hook work correctly no matter what router (or
 * router version) sits on top, since every client-side router has to go
 * through window.history to change the URL without a full page reload.
 *
 * Behavior:
 * - Back / Forward navigation  -> restore the exact saved position.
 * - Any other navigation (clicking a song, a nav link, etc.) -> start at
 *   the top, like a normal page visit.
 */

const STORAGE_KEY = "mahi-scroll-positions:v3";
const MAX_ENTRIES = 60;
const CONTAINER_ATTR = "data-scroll-restore-id";

type ScrollMap = Record<string, number>;

function readMap(): ScrollMap {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScrollMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: ScrollMap) {
  try {
    const entries = Object.entries(map);
    const trimmed: ScrollMap =
      entries.length > MAX_ENTRIES
        ? Object.fromEntries(entries.slice(entries.length - MAX_ENTRIES))
        : map;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // sessionStorage can throw in private-browsing / storage-full cases.
    // Scroll restoration is a nice-to-have, never worth crashing over.
  }
}

function locationKey() {
  return window.location.pathname + window.location.search + window.location.hash;
}

function windowKey(key: string) {
  return `window::${key}`;
}

function containerKey(key: string, containerId: string) {
  return `container::${key}::${containerId}`;
}

function saveValue(key: string, value: number) {
  const map = readMap();
  map[key] = value;
  writeMap(map);
}

function getValue(key: string): number | undefined {
  return readMap()[key];
}

function getScrollContainers(): NodeListOf<HTMLElement> {
  return document.querySelectorAll<HTMLElement>(`[${CONTAINER_ATTR}]`);
}

// Patch history.pushState/replaceState exactly once for the whole app, as
// early as possible, so every SPA navigation (no matter which router
// triggers it) also fires a "locationchange" event we can listen for —
// mirroring what already happens natively for popstate.
let historyPatched = false;

function ensureHistoryPatched() {
  if (typeof window === "undefined" || !window.history || historyPatched) return;
  historyPatched = true;

  try {
    const originalPushState = window.history.pushState
      ? window.history.pushState.bind(window.history)
      : null;
    const originalReplaceState = window.history.replaceState
      ? window.history.replaceState.bind(window.history)
      : null;

    if (originalPushState) {
      window.history.pushState = function patchedPushState(
        ...args: Parameters<typeof originalPushState>
      ) {
        const result = originalPushState(...args);
        try {
          window.dispatchEvent(new Event("mahi:locationchange"));
        } catch {}
        return result;
      } as typeof window.history.pushState;
    }

    if (originalReplaceState) {
      window.history.replaceState = function patchedReplaceState(
        ...args: Parameters<typeof originalReplaceState>
      ) {
        const result = originalReplaceState(...args);
        try {
          window.dispatchEvent(new Event("mahi:locationchange"));
        } catch {}
        return result;
      } as typeof window.history.replaceState;
    }
  } catch (err) {
    console.warn("[MEVO] History state patching skipped:", err);
  }
}

export function useScrollRestoration() {
  const isPopRef = useRef(false);
  const currentKeyRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      if (window.history && "scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
    } catch {}

    ensureHistoryPatched();
    currentKeyRef.current = locationKey();

    // --- continuously persist scroll positions for the CURRENT url ---
    let windowFrame: number | null = null;
    const handleWindowScroll = () => {
      if (windowFrame !== null) return;
      windowFrame = requestAnimationFrame(() => {
        windowFrame = null;
        saveValue(windowKey(currentKeyRef.current), window.scrollY);
      });
    };

    // Scroll events don't bubble, but they DO fire during the capture
    // phase, so one capturing listener on window catches scrolling inside
    // ANY container that opts in via data-scroll-restore-id — no
    // per-section wiring required.
    let containerFrame: number | null = null;
    const handleContainerScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const id = target.getAttribute(CONTAINER_ATTR);
      if (!id) return;

      if (containerFrame !== null) return;
      containerFrame = requestAnimationFrame(() => {
        containerFrame = null;
        saveValue(containerKey(currentKeyRef.current, id), target.scrollLeft);
      });
    };

    window.addEventListener("scroll", handleWindowScroll, { passive: true });
    window.addEventListener("scroll", handleContainerScroll, {
      passive: true,
      capture: true,
    });

    // --- react to every navigation, from whatever triggered it ---
    const handleNavigation = (wasPop: boolean) => {
      const newKey = locationKey();
      const previousKey = currentKeyRef.current;

      if (newKey === previousKey) return;

      // Snapshot the page we're LEAVING one more time — belt and braces
      // on top of the continuous save above.
      saveValue(windowKey(previousKey), window.scrollY);
      getScrollContainers().forEach((el) => {
        const id = el.getAttribute(CONTAINER_ATTR);
        if (id) saveValue(containerKey(previousKey, id), el.scrollLeft);
      });

      currentKeyRef.current = newKey;

      if (!wasPop) {
        // Normal forward navigation (clicking a song, a link, etc.) —
        // start fresh, exactly like a real page visit.
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        return;
      }

      const targetWindowY = getValue(windowKey(newKey));

      // The new route's data (song lists, etc.) can still be loading
      // async, which changes page height after our first attempt — so we
      // nudge the scroll position back into place across several frames,
      // with a couple of longer-delay backups for slow image loads.
      let attempts = 0;
      let raf = 0;

      const applyOnce = () => {
        if (targetWindowY !== undefined) {
          window.scrollTo({ top: targetWindowY, left: 0, behavior: "auto" });
        }
        getScrollContainers().forEach((el) => {
          const id = el.getAttribute(CONTAINER_ATTR);
          if (!id) return;
          const targetX = getValue(containerKey(newKey, id));
          if (targetX !== undefined) {
            el.scrollLeft = targetX;
          }
        });
      };

      const tryRestore = () => {
        attempts += 1;
        applyOnce();

        const windowSettled =
          targetWindowY === undefined || Math.abs(window.scrollY - targetWindowY) <= 2;

        if (attempts < 25 && !windowSettled) {
          raf = requestAnimationFrame(tryRestore);
        }
      };

      raf = requestAnimationFrame(tryRestore);

      // Late-loading images/content safety net.
      const lateRetry1 = window.setTimeout(applyOnce, 400);
      const lateRetry2 = window.setTimeout(applyOnce, 900);

      const cleanupLate = () => {
        cancelAnimationFrame(raf);
        window.clearTimeout(lateRetry1);
        window.clearTimeout(lateRetry2);
      };

      // Best-effort cleanup if another navigation happens mid-flight.
      window.addEventListener("mahi:locationchange", cleanupLate, {
        once: true,
      });
      window.addEventListener("popstate", cleanupLate, { once: true });
    };

    let popWindowTimeout: number | null = null;

    const handlePopState = () => {
      isPopRef.current = true;
      handleNavigation(true);

      // Some routers issue a follow-up replaceState right after Back/
      // Forward (e.g. to resolve loader state or normalize the URL). Keep
      // treating those as part of the same pop for a brief window so they
      // can't undo the restore we just applied.
      if (popWindowTimeout !== null) window.clearTimeout(popWindowTimeout);
      popWindowTimeout = window.setTimeout(() => {
        isPopRef.current = false;
      }, 600);
    };

    const handleLocationChange = () => {
      // Still inside the pop window above -> this pushState/replaceState
      // is router bookkeeping around the Back/Forward we just handled,
      // not a new forward navigation. Ignore it so it can't reset scroll.
      if (isPopRef.current) return;
      handleNavigation(false);
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("mahi:locationchange", handleLocationChange);

    return () => {
      window.removeEventListener("scroll", handleWindowScroll);
      window.removeEventListener("scroll", handleContainerScroll, {
        capture: true,
      });
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("mahi:locationchange", handleLocationChange);
      if (windowFrame !== null) cancelAnimationFrame(windowFrame);
      if (containerFrame !== null) cancelAnimationFrame(containerFrame);
      if (popWindowTimeout !== null) window.clearTimeout(popWindowTimeout);
    };
  }, []);
}
