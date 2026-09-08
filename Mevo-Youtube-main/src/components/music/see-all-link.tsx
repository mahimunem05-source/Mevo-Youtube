import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";

export function SeeAllLink({ slug }: { slug: string }) {
  return (
    <motion.div
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="inline-flex"
    >
      <Link
        to="/section/$sectionSlug"
        params={{ sectionSlug: slug }}
        className="inline-flex items-center gap-1 py-1 text-xs font-semibold text-primary transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
      >
        See All
        <ChevronRight className="size-3.5" />
      </Link>
    </motion.div>
  );
}
