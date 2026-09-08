import {
  Outlet,
  Link,
  createRootRoute,
  useRouter,
  useLocation,
} from "@tanstack/react-router";
import { useEffect } from "react";

import "../styles.css";
import { reportLovableError } from "../lib/lovable-error-reporting";

import { NavigationHistoryProvider } from "@/lib/navigation-history";
import { Navbar } from "@/components/music/navbar";
import { MobileInstallBanner } from "@/components/music/mobile-install-banner";
import { AmbientBackground } from "@/components/music/ambient-background";
import { BottomPlayer } from "@/components/music/bottom-player";
import { KeyboardShortcuts } from "@/components/music/keyboard-shortcuts";
import { Toaster } from "@/components/ui/sonner";
import { SiteFooter } from "@/components/music/site-footer";
import { useScrollRestoration } from "@/hooks/use-scroll-restoration";
import { PageTransition } from "@/components/music/page-transition";
import { PlaylistProvider } from "@/context/PlaylistContext";
import { AddToPlaylistModal } from "@/components/music/add-to-playlist-modal";
import { CreatePlaylistModal } from "@/components/music/create-playlist-modal";
import { MevoTourGuide } from "@/components/MevoTourGuide";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>

        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>

        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);

  const router = useRouter();

  useEffect(() => {
    reportLovableError(error, {
      boundary: "tanstack_root_error_component",
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>

        <p className="mt-2 text-sm text-muted-foreground">
          {error?.message || "Something went wrong on our end."}
        </p>
        {error?.stack && (
          <pre className="mt-4 max-h-48 overflow-auto rounded bg-black/80 p-3 text-left text-xs text-red-400 font-mono">
            {error.stack}
          </pre>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>

          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const location = useLocation();

  const isSongPage = location.pathname.startsWith("/song/");
  const isSectionPage = location.pathname.startsWith("/section/");

  // GLOBAL SCROLL SAVE + RESTORE
  useScrollRestoration();

  return (
    <PlaylistProvider>
      <NavigationHistoryProvider>
        <AmbientBackground />
        <KeyboardShortcuts />

        {/* Mobile PWA Top Download & Install Banner */}
        {!isSongPage && <MobileInstallBanner />}

        {/* MEVO Navigation Header (Logo + Search + Menu) on all non-song pages */}
        {!isSongPage && <Navbar />}

        <main
          className={
            isSongPage
              ? "min-h-screen w-full max-w-full p-0"
              : isSectionPage
                ? "min-h-screen w-full max-w-full pb-4 sm:pb-8 lg:pb-24 xl:pb-28 pt-0"
                : "min-h-screen w-full max-w-full pb-4 sm:pb-8 lg:pb-24 xl:pb-28 pt-2 sm:pt-3"
          }
        >
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>

        {!isSongPage && <SiteFooter />}
        {!isSongPage && <BottomPlayer />}

        {/* Global Modals & Interactive Overlays */}
        <AddToPlaylistModal />
        <CreatePlaylistModal />
        <MevoTourGuide />

        <Toaster position="top-center" />
      </NavigationHistoryProvider>
    </PlaylistProvider>
  );
}
