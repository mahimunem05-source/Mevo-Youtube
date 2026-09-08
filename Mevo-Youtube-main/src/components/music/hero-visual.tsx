import { Music4 } from "lucide-react";
import { Equalizer } from "./equalizer";

interface HeroVisualProps {
  title?: string;
  artist?: string;
}

/**
 * Hero Artwork / Music Showcase — ported 1:1 from the Emerald Aura
 * reference project's "Vinyl + artwork" hero block. Structure, classes,
 * animations and effects are unchanged. The artwork is intentionally fixed,
 * while the displayed song title and artist remain dynamic.
 */
export function HeroVisual({ title = "MEVO", artist = "Uploaded catalogue" }: HeroVisualProps) {
  return (
    <div
      className="relative flex justify-end py-0 origin-center sm:justify-center sm:py-0 sm:transform-none pr-1 sm:pr-0"
      style={{ transform: "scale(clamp(0.52, 46vw / 360px, 1))" }}
      aria-hidden="true"
    >
      <div className="absolute h-[26rem] w-[26rem] rounded-full bg-primary/25 blur-[120px] breathing" />
      <div
        className="absolute h-[18rem] w-[18rem] rounded-full bg-cyan-glow/20 blur-[90px] breathing"
        style={{ animationDelay: "1.5s" }}
      />

      {/* floating notes */}
      {[0, 1, 2, 3].map((i) => (
        <Music4
          key={i}
          aria-hidden
          className="absolute h-4 w-4 text-primary bloom-icon"
          style={{
            left: `${18 + i * 22}%`,
            bottom: "12%",
            animation: `float-note ${7 + i}s ease-in-out ${i * 1.6}s infinite`,
          }}
        />
      ))}

      <div className="relative float-slow">
        {/* vinyl disc */}
        <div
          className="absolute -right-14 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full spin-vinyl glow-ring"
          style={{
            background:
              "repeating-radial-gradient(circle, oklch(0.2 0.01 175) 0 2px, oklch(0.11 0.01 175) 2px 5px)",
          }}
        >
          <div className="absolute inset-[42%] rounded-full bg-primary/80 glow-soft" />
        </div>

        <figure className="relative z-10 overflow-hidden rounded-3xl glass glass-hover p-2">
          <img
            src="/images/mevo-hero-artwork.jpeg"
            alt=""
            width={320}
            height={320}
            loading="eager"
            decoding="async"
            draggable={false}
            className="h-72 w-72 rounded-2xl object-cover md:h-80 md:w-80"
          />
          <figcaption className="absolute inset-x-2 bottom-2 flex items-center justify-between rounded-2xl glass px-4 py-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{title}</div>
              <div className="truncate text-xs text-muted-foreground">{artist}</div>
            </div>
            <Equalizer />
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
