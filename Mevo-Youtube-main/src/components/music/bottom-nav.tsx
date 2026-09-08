import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Search, TrendingUp, Heart, Library } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * Mobile-only bottom navigation bar — fixed at bottom of viewport.
 * Order: 1. Home 2. Search 3. Trending 4. Favorites 5. Library
 * Dynamic active route highlight with bright MEVO emerald green.
 */
export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { t } = useTranslation();

  const navItems = [
    { to: "/", label: t("nav.home"), Icon: Home },
    { to: "/search", label: t("nav.search"), Icon: Search },
    { to: "/trending", label: t("nav.trending"), Icon: TrendingUp },
    { to: "/favorites", label: t("nav.favorites"), Icon: Heart },
    { to: "/library", label: t("nav.library"), Icon: Library },
  ] as const;

  return (
    <nav
      aria-label="Bottom navigation"
      className="fixed inset-x-0 bottom-0 z-40 md:hidden bg-[#0B1012] border-t border-[#26343A] shadow-[0_-8px_32px_rgba(0,0,0,0.5)] transform-gpu"
    >
      <ul className="flex items-center justify-around px-2 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))]">
        {navItems.map(({ to, label, Icon }) => {
          const active =
            to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);

          return (
            <li key={to} className="flex-1 text-center">
              <Link
                to={to}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                onClick={(e) => {
                  if (active) {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                className="flex flex-col items-center gap-0.5 py-1 transition-colors duration-200"
              >
                <Icon
                  className={`size-[22px] transition-colors duration-200 ${
                    active ? "text-teal-400 stroke-[2.2]" : "text-white/40 stroke-[1.8]"
                  }`}
                />
                <span
                  className={`text-[10px] font-medium transition-colors duration-200 ${
                    active ? "text-teal-400 font-semibold" : "text-white/40"
                  }`}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
