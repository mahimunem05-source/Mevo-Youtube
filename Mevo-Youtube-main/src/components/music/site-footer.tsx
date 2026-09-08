import { Link } from "@tanstack/react-router";
import { Music4 } from "lucide-react";

/**
 * MEVO footer. Visual language transferred from Aura's glass/aurora system:
 * `glass` hairline dividers, `font-display` + `tracking-[0.2em]` wordmark,
 * `text-aurora` gradient text, `bloom-icon` glow and Aura's
 * `transition-colors duration-300 hover:text-primary` link behaviour.
 */
const identity = [
  { letter: "M", word: "M. Mahi" },
  { letter: "E", word: "Elevated" },
  { letter: "V", word: "Vibes" },
  { letter: "O", word: "Originals" },
] as const;

// Existing MEVO Instagram profile — unchanged.
const INSTAGRAM_URL = "https://www.instagram.com/_munem_mahi_/";
const FACEBOOK_URL =
  "https://www.facebook.com/munem.mahi.9/about/?fb_profile_edit_entry_point=%7B%22click_point%22%3A%22edit_profile_button%22%2C%22feature%22%3A%22profile_header%22%7D&id=100063052907505&sk=about";

const socialLinks = [
  { name: "Instagram", href: INSTAGRAM_URL },
  { name: "Facebook", href: FACEBOOK_URL },
] as const;

const navLinks = [
  { label: "Contact", to: "/contact" },
  { label: "Support", to: "/support" },
  { label: "Privacy", to: "/privacy" },
  { label: "Terms", to: "/terms" },
] as const;

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-6 sm:mt-10 max-w-6xl px-4 sm:px-6 pb-28 sm:pb-32 md:px-12">
      <div className="hidden sm:block h-px w-full bg-border/60" />

      <div className="grid grid-cols-2 gap-6 sm:gap-12 py-6 sm:py-10">
        {/* Left Column: MEVO Acronym + Facebook */}
        <div className="space-y-4">
          <ul className="space-y-2 text-sm font-light text-muted-foreground">
            {identity.map(({ letter, word }) => (
              <li key={letter} className="tracking-wide">
                <span className="font-display text-foreground">{letter}</span>
                <span className="px-2 opacity-50">—</span>
                <span>{word}</span>
              </li>
            ))}
          </ul>
          <div>
            <a
              href={FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="MEVO on Facebook (opens in a new tab)"
              className="text-sm font-light text-muted-foreground transition-colors duration-300 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              Facebook
            </a>
          </div>
        </div>

        {/* Right Column: Footer Links + Instagram */}
        <div className="space-y-4">
          <ul className="space-y-2 text-sm font-light text-muted-foreground">
            {navLinks.map((link) => (
              <li key={link.label}>
                <Link
                  to={link.to}
                  className="transition-colors duration-300 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="MEVO on Instagram (opens in a new tab)"
              className="text-sm font-light text-muted-foreground transition-colors duration-300 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              Instagram
            </a>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-start justify-between gap-4 pb-8 sm:flex-row sm:items-center">
        <span className="font-display text-xs font-light uppercase tracking-[0.3em] text-muted-foreground">
          Evolution of Sound
        </span>
        <Link to="/" className="flex items-center gap-2 mevo-breathing-glow" aria-label="MEVO home">
          <Music4 className="h-4 w-4" />
          <span className="font-display text-sm font-semibold tracking-[0.2em]">MEVO</span>
        </Link>
      </div>

      <div className="h-px w-full bg-border/60" />

      <div className="flex flex-col items-start justify-between gap-2 pt-6 text-xs font-light text-muted-foreground/70 sm:flex-row sm:items-center">
        <span>© 2026 MEVO. All rights reserved.</span>
        <span>Crafted by M. Mahi</span>
      </div>
    </footer>
  );
}
