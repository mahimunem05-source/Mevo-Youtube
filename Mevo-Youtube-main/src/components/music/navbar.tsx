import { useEffect, useState, useCallback, memo } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "motion/react";
import {
  Music4,
  Menu,
  X,
  Search,
  Home,
  TrendingUp,
  ListMusic,
  Disc3,
  User,
  Download,
  Heart,
  History,
  Settings,
  Info,
  ChevronDown,
  EllipsisVertical,
} from "lucide-react";
import { LiveSearch } from "./live-search";
import { useSettings } from "@/context/SettingsContext";
import { useTranslation } from "@/hooks/useTranslation";

const mainNav = [
  { to: "/", key: "nav.home", defaultLabel: "Home", Icon: Home, exact: true },
  {
    to: "/trending",
    key: "nav.trending",
    defaultLabel: "Trending",
    Icon: TrendingUp,
    exact: false,
  },
  {
    to: "/all-songs",
    key: "nav.allSongs",
    defaultLabel: "All Songs",
    Icon: ListMusic,
    exact: false,
  },
  { to: "/albums", key: "nav.albums", defaultLabel: "Albums", Icon: Disc3, exact: false },
  { to: "/artists", key: "nav.artists", defaultLabel: "Artists", Icon: User, exact: false },
  {
    to: "/downloads",
    key: "nav.downloads",
    defaultLabel: "Downloads",
    Icon: Download,
    exact: false,
  },
] as const;

const secondaryNav = [
  {
    to: "/favorites" as const,
    params: undefined,
    href: "/favorites",
    key: "nav.favorites",
    defaultLabel: "Favorites",
    Icon: Heart,
    exact: false,
  },
  {
    to: "/section/$sectionSlug" as const,
    params: { sectionSlug: "recently-played" },
    href: "/section/recently-played",
    key: "nav.recentlyPlayed",
    defaultLabel: "Recently Played",
    Icon: History,
    exact: false,
  },
];

const utilityNav = [
  { to: "/settings", key: "nav.settings", defaultLabel: "Settings", Icon: Settings },
  { to: "/about", key: "nav.about", defaultLabel: "About MEVO", Icon: Info },
] as const;

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  pathname: string;
}

const MobileDrawer = memo(function MobileDrawerComponent({
  isOpen,
  onClose,
  pathname,
}: MobileDrawerProps) {
  const isItemActive = (to: string, exact?: boolean) => {
    if (exact || to === "/") return pathname === "/";
    return pathname === to || pathname.startsWith(`${to}/`);
  };

  const { settings } = useSettings();
  const { t } = useTranslation();
  const themeLabel =
    settings.theme === "midnight"
      ? "Pure Midnight"
      : settings.theme === "light"
        ? "Bright Light"
        : "Dark Emerald";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Dark Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              willChange: "opacity",
              transform: "translate3d(0,0,0)",
              backfaceVisibility: "hidden",
            }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />

          {/* Left Drawer Panel */}
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            style={{
              willChange: "transform",
              transform: "translate3d(0,0,0)",
              backfaceVisibility: "hidden",
            }}
            className="fixed inset-y-0 left-0 z-50 flex w-[82%] max-w-80 flex-col bg-[#0B1012] border-r border-[#26343A] p-5 shadow-2xl overflow-y-auto"
          >
            {/* Drawer Top: MEVO Logo */}
            <div className="flex items-center justify-between pb-6 border-b border-[#26343A]">
              <Link
                to="/"
                onClick={onClose}
                className="flex items-center gap-2 mevo-breathing-glow"
              >
                <Music4 className="size-6" />
                <span className="font-display text-lg font-extrabold tracking-[0.2em]">MEVO</span>
              </Link>
              <button
                type="button"
                aria-label="Close menu"
                onClick={onClose}
                className="grid size-8 place-items-center rounded-full text-white/60 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 space-y-6 pt-6">
              {/* 1. Main Navigation */}
              <nav aria-label="Main menu">
                <ul className="space-y-1">
                  {mainNav.map(({ to, key, defaultLabel, Icon, exact }) => {
                    const active = isItemActive(to, exact);
                    return (
                      <li key={to}>
                        <Link
                          to={to}
                          onClick={onClose}
                          className={`flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                            active
                              ? "bg-[#182227] border border-[#4FD1C5]/40 text-teal-400 shadow-sm"
                              : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          <Icon
                            className={`size-4 ${active ? "text-teal-400" : "text-white/50"}`}
                          />
                          {t(key, defaultLabel)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              {/* Divider */}
              <div className="h-px w-full bg-white/10" />

              {/* 2. Secondary Navigation */}
              <nav aria-label="Secondary menu">
                <ul className="space-y-1">
                  {secondaryNav.map(({ to, params, href, key, defaultLabel, Icon, exact }) => {
                    const active = isItemActive(href, exact);
                    return (
                      <li key={href}>
                        <Link
                          to={to as any}
                          params={params as any}
                          onClick={onClose}
                          className={`flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 ${
                            active
                              ? "bg-[#182227] border border-[#4FD1C5]/40 text-teal-400 font-semibold"
                              : "text-white/70 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          <Icon
                            className={`size-4 ${active ? "text-teal-400" : "text-white/50"}`}
                          />
                          {t(key, defaultLabel)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              {/* Divider */}
              <div className="h-px w-full bg-white/10" />

              {/* 3. Utility Navigation */}
              <nav aria-label="Utility menu">
                <ul className="space-y-1">
                  {utilityNav.map(({ to, key, defaultLabel, Icon }) => {
                    const active = isItemActive(to);
                    return (
                      <li key={to}>
                        <Link
                          to={to}
                          onClick={onClose}
                          className={`flex items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200 ${
                            active
                              ? "bg-[#182227] text-teal-400 font-semibold"
                              : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          <Icon className="size-4 text-white/50" />
                          {t(key, defaultLabel)}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>

            {/* Drawer Bottom: Theme/Mode selector pill */}
            <div className="pt-6 mt-auto border-t border-white/10">
              <Link
                to="/settings"
                onClick={onClose}
                className="flex items-center justify-between rounded-2xl bg-[#182227] border border-[#26343A] px-3.5 py-2.5 text-xs text-white/80 transition-colors hover:border-teal-400/40"
              >
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#4FD1C5] animate-pulse" />
                  <span className="font-semibold text-teal-400">{themeLabel}</span>
                </div>
                <ChevronDown className="size-3.5 text-teal-400/70" />
              </Link>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
});

/**
 * Global Header + Hamburger Side Navigation Drawer.
 * Matches reference collage bottom-left drawer & top-right header controls.
 */
function NavbarComponent() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isSectionPage = pathname.startsWith("/section/");

  // Prevent background scrolling while drawer is open
  useEffect(() => {
    if (drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const isItemActive = (to: string, exact?: boolean) => {
    if (exact || to === "/") return pathname === "/";
    return pathname === to || pathname.startsWith(`${to}/`);
  };

  // Completely omit top Navbar on See All / Section pages — controls are integrated directly into the Back button row
  if (isSectionPage) {
    return null;
  }

  return (
    <>
      <header className="relative w-full z-40 bg-transparent px-3 py-2.5 sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          {/* Top Left: MEVO Logo (Omitted on See All / Section pages) */}
          {!isSectionPage ? (
            <Link
              to="/"
              className="flex items-center gap-2 transition-opacity hover:opacity-90 mevo-breathing-glow"
              aria-label="MEVO home"
            >
              <Music4 className="size-5" />
              <span className="font-display text-base font-extrabold tracking-[0.2em]">MEVO</span>
            </Link>
          ) : (
            <div />
          )}

          {/* Desktop Navigation Links (Omitted on See All / Section pages) */}
          {!isSectionPage && (
            <ul className="hidden items-center gap-7 text-xs font-semibold text-slate-600 dark:text-white/70 md:flex">
              {mainNav.map((link) => {
                const active = isItemActive(link.to, link.exact);
                return (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className={`transition-colors duration-200 hover:text-teal-600 dark:hover:text-teal-400 ${
                        active ? "text-teal-600 dark:text-teal-400 font-bold" : ""
                      }`}
                    >
                      {t(link.key, link.defaultLabel)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Top Right: Minimal Search & 3-dot / Menu Buttons matching See All design */}
          <div className="flex items-center gap-2">
            {/* Search Pill / Trigger */}
            {searchOpen ? (
              <div className="relative flex items-center">
                <LiveSearch
                  variant="compact"
                  autoFocus={true}
                  onClose={() => setSearchOpen(false)}
                />
                <button
                  type="button"
                  aria-label="Close search"
                  onClick={() => setSearchOpen(false)}
                  className="ml-1.5 grid size-8 shrink-0 place-items-center rounded-full bg-white/80 dark:bg-white/[0.08] text-slate-800 dark:text-white/90 border border-slate-200/80 dark:border-white/10 backdrop-blur-md shadow-sm dark:shadow-lg transition-all hover:bg-slate-100 dark:hover:bg-white/15 focus:outline-none cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                aria-label="Search"
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2 rounded-full bg-white/80 dark:bg-white/[0.07] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-white/70 border border-slate-200/80 dark:border-transparent backdrop-blur-md shadow-xs dark:shadow-none transition-colors hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <Search className="size-3.5 text-teal-600 dark:text-teal-400" />
                <span className="hidden sm:inline">{t("nav.searchPlaceholder", "Search...")}</span>
              </button>
            )}

            {/* Circular 3-dot / Menu Button */}
            <button
              type="button"
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((o) => !o)}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-white/80 dark:bg-white/[0.08] text-slate-800 dark:text-white/80 border border-slate-200/80 dark:border-transparent backdrop-blur-md shadow-xs dark:shadow-none transition-colors hover:bg-slate-100 dark:hover:bg-white/15 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              {drawerOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE SIDE NAVIGATION DRAWER */}
      <MobileDrawer isOpen={drawerOpen} onClose={closeDrawer} pathname={pathname} />
    </>
  );
}

export const Navbar = memo(NavbarComponent);
