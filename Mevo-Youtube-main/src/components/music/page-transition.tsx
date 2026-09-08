import { type ReactNode } from "react";

interface PageTransitionProps {
  children: ReactNode;
}

/**
 * PageTransition — renders route content directly and reliably without AnimatePresence opacity locks.
 */
export function PageTransition({ children }: PageTransitionProps) {
  return <div className="w-full">{children}</div>;
}
