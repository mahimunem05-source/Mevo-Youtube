import { ChevronLeft } from "lucide-react";
import { useNavigationHistory } from "@/lib/navigation-history";

/**
 * Premium minimal top bar rendered ONLY on internal pages (Album, Artist, Playlist, Section, Settings, Downloads, etc.).
 * Replaces the global MEVO header with a clean top-left Back button.
 */
export function InternalTopBar() {
  const { goBack } = useNavigationHistory();

  return (
    <header className="relative w-full z-40 bg-transparent px-4 py-3 sm:px-6 md:px-12">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <button
          type="button"
          onClick={() => goBack("/")}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3.5 py-1.5 text-xs font-extrabold text-white/90 backdrop-blur-md transition-all hover:bg-white/15 hover:text-white border border-white/10 shadow-lg focus:outline-none"
          aria-label="Go back"
        >
          <ChevronLeft className="size-4 text-teal-400" />
          <span>Back</span>
        </button>
      </div>
    </header>
  );
}
