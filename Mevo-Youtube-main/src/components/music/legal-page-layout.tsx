import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/music/page-header";

export type LegalSection = {
  id: string;
  heading: string;
  body: ReactNode;
};

const legalTabs = [
  { to: "/privacy", label: "Privacy Policy" },
  { to: "/terms", label: "Terms of Use" },
] as const;

/**
 * Shared layout for the MEVO legal section (/privacy and /terms).
 * Uses the site's existing glass/aurora language: hairline dividers,
 * thin typography and Aura's `transition-colors duration-300 hover:text-primary`.
 */
export function LegalPageLayout({
  title,
  intro,
  lastUpdated,
  current,
  sections,
}: {
  title: string;
  intro: string;
  lastUpdated: string;
  current: "/privacy" | "/terms";
  sections: readonly LegalSection[];
}) {
  const other = current === "/privacy" ? legalTabs[1] : legalTabs[0];

  return (
    <div>
      <PageHeader eyebrow="MEVO Legal" title={title} subtitle={intro} />

      <div className="mx-auto max-w-6xl px-6 md:px-12">
        <div className="flex flex-wrap items-center gap-4">
          <nav
            aria-label="Legal pages"
            className="inline-flex items-center gap-1 rounded-full glass p-1"
          >
            {legalTabs.map((tab) => {
              const active = tab.to === current;
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-4 py-2 text-xs font-light tracking-wide transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-primary"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>

          <p className="text-xs font-light text-muted-foreground/80">Last updated: {lastUpdated}</p>
        </div>

        <div className="mt-10 h-px w-full bg-border/60" />

        <div className="grid gap-10 py-10 lg:grid-cols-[16rem_1fr]">
          <aside className="hidden lg:block">
            <nav aria-label="On this page" className="sticky top-28 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground/70">
                On this page
              </p>
              <ul className="space-y-1.5 text-sm font-light text-muted-foreground">
                {sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className="transition-colors duration-300 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                    >
                      {section.heading}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>

          <article className="max-w-3xl space-y-10">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="scroll-mt-28">
                <h2 className="font-display text-lg font-semibold tracking-tight">
                  {section.heading}
                </h2>
                <div className="mt-3 space-y-3 text-sm font-light leading-relaxed text-muted-foreground">
                  {section.body}
                </div>
              </section>
            ))}

            <div className="h-px w-full bg-border/60" />

            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-sm font-light text-muted-foreground transition-colors duration-300 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                <ArrowLeft className="size-4" /> Back to Home
              </Link>

              <Link
                to={other.to}
                className="inline-flex items-center gap-2 text-sm font-light text-muted-foreground transition-colors duration-300 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
              >
                Read the MEVO {other.label} <ArrowRight className="size-4" />
              </Link>
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
