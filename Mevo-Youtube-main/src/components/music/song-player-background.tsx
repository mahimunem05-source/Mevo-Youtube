import { memo } from "react";
import { useSettings } from "@/context/SettingsContext";

/**
 * SongPlayerBackground — Dedicated cinematic ambient background for the Main Song Player page.
 *
 * Scoped exclusively to the Song Details / Full Player view (/song/$songId).
 * Delivers a luxurious Dark Emerald ambient lighting effect behind the artwork, lyrics,
 * and playback controls while maintaining maximum mobile performance and zero CPU/GPU drag.
 */
export const SongPlayerBackground = memo(function SongPlayerBackground() {
  const { resolvedTheme } = useSettings();

  if (resolvedTheme === "light") {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-20 h-full w-full overflow-hidden select-none"
        style={{
          backgroundColor: "#f8fafc",
          contain: "layout paint",
          transform: "translateZ(0)",
          WebkitTransform: "translateZ(0)",
          backfaceVisibility: "hidden",
        }}
      >
        {/* Light Mode Base */}
        <div
          className="absolute inset-0 h-full w-full"
          style={{
            background:
              "linear-gradient(180deg, #ffffff 0%, #f1f5f9 45%, #e2e8f0 85%, #f8fafc 100%)",
          }}
        />

        {/* Soft daylight emerald ambient glows */}
        <div
          className="absolute -top-[10%] -left-[5%] h-[60vh] w-[75vw] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(13, 148, 136, 0.09) 0%, rgba(79, 209, 197, 0.05) 45%, transparent 75%)",
            filter: "blur(70px)",
          }}
        />
        <div
          className="absolute top-[20%] -right-[10%] h-[65vh] w-[70vw] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(79, 209, 197, 0.08) 0%, rgba(13, 148, 136, 0.04) 45%, transparent 75%)",
            filter: "blur(80px)",
          }}
        />
        <div
          className="absolute bottom-[5%] left-[10%] h-[50vh] w-[65vw] rounded-full"
          style={{
            background:
              "radial-gradient(circle at center, rgba(13, 148, 136, 0.06) 0%, transparent 70%)",
            filter: "blur(75px)",
          }}
        />
      </div>
    );
  }

  if (resolvedTheme === "midnight") {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-20 h-full w-full overflow-hidden select-none"
        style={{
          backgroundColor: "#000000",
          contain: "layout paint",
          transform: "translateZ(0)",
          WebkitTransform: "translateZ(0)",
          backfaceVisibility: "hidden",
        }}
      >
        {/* Pure Obsidian Gradient */}
        <div
          className="absolute inset-0 h-full w-full"
          style={{
            background:
              "linear-gradient(180deg, #09090b 0%, #050507 40%, #020203 70%, #000000 100%)",
          }}
        />

        {/* Deep atmospheric depth */}
        <div
          className="absolute inset-0 h-full w-full"
          style={{
            background:
              "radial-gradient(ellipse 140% 90% at 50% -10%, rgba(24, 24, 27, 0.5) 0%, rgba(9, 9, 11, 0.3) 50%, rgba(0, 0, 0, 0.85) 100%)",
          }}
        />

        {/* Faint twilight zinc ambient lighting */}
        <div
          className="absolute -top-[10%] -left-[5%] h-[60vh] w-[75vw] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255, 255, 255, 0.035) 0%, rgba(161, 161, 170, 0.015) 40%, transparent 75%)",
            filter: "blur(75px)",
          }}
        />
        <div
          className="absolute top-[25%] -right-[10%] h-[65vh] w-[70vw] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255, 255, 255, 0.03) 0%, rgba(113, 113, 122, 0.015) 40%, transparent 75%)",
            filter: "blur(80px)",
          }}
        />

        {/* Vignette */}
        <div
          className="absolute inset-0 h-full w-full"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, transparent 40%, rgba(0, 0, 0, 0.5) 75%, rgba(0, 0, 0, 0.85) 100%)",
          }}
        />
      </div>
    );
  }

  // Default: Dark Emerald Theme
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-20 h-full w-full overflow-hidden select-none"
      style={{
        backgroundColor: "#030607",
        contain: "layout paint",
        transform: "translateZ(0)",
        WebkitTransform: "translateZ(0)",
        backfaceVisibility: "hidden",
      }}
    >
      {/* 1. Deep Charcoal-to-Obsidian Emerald Base Gradient */}
      <div
        className="absolute inset-0 h-full w-full"
        style={{
          background: "linear-gradient(180deg, #0d1518 0%, #090e11 35%, #05080a 70%, #030506 100%)",
        }}
      />

      {/* 2. Atmospheric Volumetric Ceiling Depth */}
      <div
        className="absolute inset-0 h-full w-full"
        style={{
          background:
            "radial-gradient(ellipse 140% 85% at 50% -10%, rgba(20, 35, 42, 0.65) 0%, rgba(11, 20, 24, 0.50) 45%, rgba(3, 6, 7, 0.85) 100%)",
        }}
      />

      {/* 3. Upper Left Emerald Aura (Stage Lighting) */}
      <div
        className="absolute -top-[12%] -left-[8%] h-[65vh] w-[75vw] max-w-[900px] max-h-[700px] rounded-full"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(13, 148, 136, 0.16) 0%, rgba(20, 184, 166, 0.08) 35%, rgba(6, 78, 59, 0.02) 65%, transparent 80%)",
          filter: "blur(80px)",
        }}
      />

      {/* 4. Upper Right Teal-Cyan Glow (Acoustic Illumination) */}
      <div
        className="absolute top-[8%] -right-[10%] h-[70vh] w-[70vw] max-w-[850px] max-h-[750px] rounded-full"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(79, 209, 197, 0.14) 0%, rgba(15, 118, 110, 0.06) 40%, rgba(4, 47, 46, 0.015) 65%, transparent 80%)",
          filter: "blur(85px)",
        }}
      />

      {/* 5. Mid-Left Side Ambient Accent (creates widescreen stage wrap) */}
      <div
        className="absolute top-[45%] -left-[10%] h-[55vh] w-[60vw] max-w-[700px] max-h-[600px] rounded-full hidden sm:block"
        style={{
          background:
            "radial-gradient(circle at center, rgba(20, 184, 166, 0.09) 0%, rgba(13, 148, 136, 0.03) 45%, transparent 75%)",
          filter: "blur(85px)",
        }}
      />

      {/* 6. Lower Right Side Ambient Accent */}
      <div
        className="absolute bottom-[5%] -right-[8%] h-[50vh] w-[60vw] max-w-[650px] max-h-[550px] rounded-full"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(79, 209, 197, 0.08) 0%, rgba(6, 78, 59, 0.025) 45%, transparent 75%)",
          filter: "blur(90px)",
        }}
      />

      {/* 7. Subtle Flowing Acoustic Harmonic Curves (Vector SVG, static & lightweight) */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.05] md:opacity-[0.065]"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="emeraldWaveGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4FD1C5" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#14B8A6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#0D9488" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="emeraldWaveGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#0F766E" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#064E3B" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Soft flowing acoustic resonance arcs */}
        <path
          d="M-100,180 C280,120 450,420 850,260 C1150,140 1380,320 1600,280"
          fill="none"
          stroke="url(#emeraldWaveGrad1)"
          strokeWidth="1.5"
        />
        <path
          d="M-80,320 C320,240 540,580 960,390 C1280,240 1420,480 1620,420"
          fill="none"
          stroke="url(#emeraldWaveGrad2)"
          strokeWidth="1.2"
        />
        <path
          d="M-50,620 C240,480 620,720 1020,540 C1320,400 1480,680 1600,640"
          fill="none"
          stroke="url(#emeraldWaveGrad1)"
          strokeWidth="1"
        />
      </svg>

      {/* 8. Fine Acoustic Noise Texture (Desktop only, 0.02 opacity for velvet finish) */}
      <div
        className="pointer-events-none absolute inset-0 hidden h-full w-full opacity-[0.022] md:block"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          mixBlendMode: "overlay",
        }}
      />

      {/* 9. Cinematic Stage Vignette — keeps center artwork & lyrics clear and readable */}
      <div
        className="absolute inset-0 h-full w-full"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 40%, rgba(3, 6, 7, 0.30) 72%, rgba(2, 4, 5, 0.65) 100%)",
        }}
      />
    </div>
  );
});
