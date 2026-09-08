import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

interface NavigationHistoryContextType {
  previousRoute: string | null;
  playerSourceRoute: string;
  recordPlayerSource: (customSource?: string) => void;
  goBack: (fallback?: string) => void;
  dismissPlayer: () => void;
  navigateTab: (to: string) => void;
}

const NavigationHistoryContext = createContext<NavigationHistoryContextType | null>(null);

const STORAGE_PLAYER_SOURCE = "mevo_player_source_route";

function getPathString(location: { pathname?: string; href?: string }): string {
  if (!location) return "/";
  if (location.href) return location.href;
  return location.pathname || "/";
}

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const currentPath = getPathString(location);
  const currentPathRef = useRef<string>(currentPath);
  const previousRouteRef = useRef<string | null>(null);

  // Initialize with "/" for deterministic SSR & hydration
  const [playerSourceRoute, setPlayerSourceRouteState] = useState<string>("/");
  const playerSourceRef = useRef<string>(playerSourceRoute);

  // Hydrate stored source route after initial mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_PLAYER_SOURCE);
      if (stored) {
        setPlayerSourceRouteState(stored);
        playerSourceRef.current = stored;
      }
    } catch {
      // Storage unavailable
    }
  }, []);

  useEffect(() => {
    playerSourceRef.current = playerSourceRoute;
  }, [playerSourceRoute]);

  // Track route transitions safely
  useEffect(() => {
    const newPath = getPathString(location);
    const oldPath = currentPathRef.current;

    if (newPath !== oldPath) {
      // If leaving a non-song page, remember it as potential previousRoute
      if (!oldPath.startsWith("/song/")) {
        previousRouteRef.current = oldPath;
      }
      currentPathRef.current = newPath;
    }
  }, [location]);

  // Explicitly record source page before navigating into player
  const recordPlayerSource = (customSource?: string) => {
    const activePath = getPathString(location);
    const source =
      customSource || (activePath.startsWith("/song/") ? playerSourceRef.current : activePath);
    const validSource = source && !source.startsWith("/song/") ? source : "/";

    setPlayerSourceRouteState(validSource);
    playerSourceRef.current = validSource;

    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(STORAGE_PLAYER_SOURCE, validSource);
      } catch {
        // Storage unavailable
      }
    }
  };

  const goBack = (fallback = "/") => {
    const target =
      previousRouteRef.current && !previousRouteRef.current.startsWith("/song/")
        ? previousRouteRef.current
        : fallback;

    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      void navigate({ to: target });
    }
  };

  const dismissPlayer = () => {
    const targetSource =
      playerSourceRef.current && !playerSourceRef.current.startsWith("/song/")
        ? playerSourceRef.current
        : previousRouteRef.current && !previousRouteRef.current.startsWith("/song/")
          ? previousRouteRef.current
          : "/";

    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else {
      void navigate({ to: targetSource });
    }
  };

  const navigateTab = (to: string) => {
    const current = location?.pathname || "/";
    if (current === to) return;
    void navigate({ to, replace: false });
  };

  return (
    <NavigationHistoryContext.Provider
      value={{
        previousRoute: previousRouteRef.current,
        playerSourceRoute,
        recordPlayerSource,
        goBack,
        dismissPlayer,
        navigateTab,
      }}
    >
      {children}
    </NavigationHistoryContext.Provider>
  );
}

const defaultFallbackContext: NavigationHistoryContextType = {
  previousRoute: null,
  playerSourceRoute: "/",
  recordPlayerSource: () => {},
  goBack: (fallback = "/") => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else if (typeof window !== "undefined") {
      window.location.href = fallback;
    }
  },
  dismissPlayer: () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
    } else if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  },
  navigateTab: () => {},
};

export function useNavigationHistory() {
  const ctx = useContext(NavigationHistoryContext);
  return ctx || defaultFallbackContext;
}
