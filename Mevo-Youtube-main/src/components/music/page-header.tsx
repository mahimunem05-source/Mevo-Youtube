import { motion } from "motion/react";
import { AppBackButton } from "./app-back-button";

/** Shared page title block with floating transparent back button used by secondary routes. */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto max-w-6xl px-4 sm:px-6 md:px-12 pb-8 pt-1 sm:pt-2"
    >
      <AppBackButton fallbackTo="/" />
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">{eyebrow}</p>
      <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight md:text-5xl">
        {title}
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">{subtitle}</p>
    </motion.header>
  );
}
