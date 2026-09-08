import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useNavigationHistory } from "@/lib/navigation-history";

type BackFallback = "/" | "/albums" | "/artists" | "/trending" | string;

interface AppBackButtonProps {
  fallbackTo?: BackFallback;
  className?: string;
}

/**
 * Floating transparent Back Button rendered on internal pages directly over hero/gradient background.
 * Matches Spotify, Apple Music & TIDAL UX.
 */
export function AppBackButton({ fallbackTo = "/", className }: AppBackButtonProps) {
  const { goBack } = useNavigationHistory();

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      onClick={() => goBack(fallbackTo)}
      className={cn(
        "relative z-30 mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/80 dark:bg-white/[0.08] px-3.5 py-1.5 text-xs font-extrabold text-slate-800 dark:text-white/90 backdrop-blur-md transition-all hover:bg-slate-100 dark:hover:bg-white/15 hover:text-slate-900 dark:hover:text-white border border-slate-200/80 dark:border-white/10 shadow-sm dark:shadow-lg focus:outline-none cursor-pointer",
        className,
      )}
      aria-label="Go back"
    >
      <ArrowLeft className="size-4 text-teal-600 dark:text-teal-400" />
      <span>Back</span>
    </motion.button>
  );
}
