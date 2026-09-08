import type { ReactNode } from "react";
import { motion, type HTMLMotionProps } from "motion/react";

type Props = HTMLMotionProps<"button"> & {
  variant?: "neon" | "glass" | "solid";
  children: ReactNode;
};

/**
 * Clean button with Spotify-like 0.98 scale tap feedback.
 * No neon glow, pulse, ripple explosion or flashy effects.
 */
export function GlowButton({ variant = "solid", children, className = "", ...rest }: Props) {
  const isSolid = variant === "neon" || variant === "solid";

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      whileHover={{ scale: 1.02 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className={`relative inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs font-semibold tracking-wide transition-colors sm:px-6 sm:py-2.5 sm:text-sm ${
        isSolid
          ? "bg-primary text-primary-foreground hover:bg-primary/90"
          : "border border-white/10 bg-white/5 text-foreground hover:bg-white/10"
      } ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
