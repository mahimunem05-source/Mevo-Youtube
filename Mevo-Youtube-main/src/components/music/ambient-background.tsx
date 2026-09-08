import { useSettings } from "@/context/SettingsContext";

/**
 * AmbientBackground — Theme-reactive static cinematic background.
 *
 * Smoothly adapts ambient depth and radial glows to the active theme:
 * - Dark Emerald: signature teal/cyan and volumetric slate clouds
 * - Midnight: pure pitch obsidian with subtle twilight depth
 * - Light: luminous daylight radiance with soft pearl and teal accents
 */
export function AmbientBackground() {
  const { resolvedTheme } = useSettings();

  if (resolvedTheme === "light") {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-50 h-full w-full overflow-hidden select-none"
        style={{
          backgroundColor: "#f8fafc",
          contain: "layout paint",
          transform: "translateZ(0)",
          WebkitTransform: "translateZ(0)",
          backfaceVisibility: "hidden",
        }}
      >
        {/* Soft daylight base gradient */}
        <div
          className="absolute inset-0 h-full w-full"
          style={{
            background:
              "linear-gradient(180deg, #ffffff 0%, #f1f5f9 45%, #e2e8f0 85%, #f8fafc 100%)",
          }}
        />

        {/* Soft daylight atmospheric depth */}
        <div
          className="absolute inset-0 h-full w-full"
          style={{
            background:
              "radial-gradient(ellipse 150% 100% at 50% -10%, rgba(203, 213, 225, 0.45) 0%, rgba(226, 232, 240, 0.35) 50%, rgba(248, 250, 252, 0.7) 100%)",
          }}
        />

        {/* Luminous soft clouds */}
        <div
          className="absolute -top-[10%] -left-[5%] h-[65vh] w-[80vw] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(13, 148, 136, 0.08) 0%, rgba(56, 189, 248, 0.06) 45%, transparent 75%)",
            filter: "blur(80px)",
          }}
        />
        <div
          className="absolute top-[22%] -right-[10%] h-[70vh] w-[75vw] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(56, 189, 248, 0.09) 0%, rgba(13, 148, 136, 0.05) 45%, transparent 75%)",
            filter: "blur(90px)",
          }}
        />
        <div
          className="absolute top-[48%] -left-[12%] h-[60vh] w-[70vw] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(99, 102, 241, 0.06) 0%, rgba(13, 148, 136, 0.04) 45%, transparent 75%)",
            filter: "blur(85px)",
          }}
        />
        <div
          className="absolute top-[16%] right-[6%] h-[50vh] w-[55vw] rounded-full"
          style={{
            background:
              "radial-gradient(circle at center, rgba(13, 148, 136, 0.09) 0%, transparent 75%)",
            filter: "blur(85px)",
          }}
        />
      </div>
    );
  }

  if (resolvedTheme === "midnight") {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-50 h-full w-full overflow-hidden select-none"
        style={{
          backgroundColor: "#000000",
          contain: "layout paint",
          transform: "translateZ(0)",
          WebkitTransform: "translateZ(0)",
          backfaceVisibility: "hidden",
        }}
      >
        {/* Pure Midnight Obsidian Gradient */}
        <div
          className="absolute inset-0 h-full w-full"
          style={{
            background:
              "linear-gradient(180deg, #09090b 0%, #050507 40%, #020203 70%, #000000 100%)",
          }}
        />

        {/* Deep Atmospheric Depth */}
        <div
          className="absolute inset-0 h-full w-full"
          style={{
            background:
              "radial-gradient(ellipse 150% 100% at 50% -10%, rgba(24, 24, 27, 0.5) 0%, rgba(9, 9, 11, 0.4) 50%, rgba(0, 0, 0, 0.85) 100%)",
          }}
        />

        {/* Subtle Obsidian/Zinc Twilight Glows */}
        <div
          className="absolute -top-[10%] -left-[5%] h-[65vh] w-[80vw] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255, 255, 255, 0.04) 0%, rgba(161, 161, 170, 0.02) 40%, transparent 75%)",
            filter: "blur(80px)",
          }}
        />
        <div
          className="absolute top-[22%] -right-[10%] h-[70vh] w-[75vw] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(255, 255, 255, 0.035) 0%, rgba(113, 113, 122, 0.02) 40%, transparent 75%)",
            filter: "blur(90px)",
          }}
        />
        <div
          className="absolute top-[16%] right-[6%] h-[50vh] w-[55vw] rounded-full"
          style={{
            background:
              "radial-gradient(circle at center, rgba(255, 255, 255, 0.03) 0%, transparent 75%)",
            filter: "blur(85px)",
          }}
        />

        {/* Edge Vignette */}
        <div
          className="absolute inset-0 h-full w-full"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, transparent 40%, rgba(0, 0, 0, 0.4) 75%, rgba(0, 0, 0, 0.8) 100%)",
          }}
        />
      </div>
    );
  }

  // Default: Dark Emerald Theme
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-50 h-full w-full overflow-hidden select-none"
      style={{
        backgroundColor: "#040506",
        contain: "layout paint",
        transform: "translateZ(0)",
        WebkitTransform: "translateZ(0)",
        backfaceVisibility: "hidden",
      }}
    >
      {/* Base Charcoal-to-Black Linear Gradient */}
      <div
        className="absolute inset-0 h-full w-full"
        style={{
          background: "linear-gradient(180deg, #161A1D 0%, #0D1013 40%, #080A0C 70%, #040506 100%)",
        }}
      />

      {/* Volumetric Atmospheric Radial Depth */}
      <div
        className="absolute inset-0 h-full w-full"
        style={{
          background:
            "radial-gradient(ellipse 150% 100% at 50% -10%, rgba(38, 48, 58, 0.55) 0%, rgba(20, 26, 32, 0.45) 50%, rgba(8, 10, 13, 0.70) 100%)",
        }}
      />

      {/* Cloud Layer 1: Upper Horizon Volumetric Cloud — static */}
      <div
        className="absolute -top-[10%] -left-[5%] h-[65vh] w-[80vw] rounded-full"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(230, 242, 255, 0.22) 0%, rgba(145, 182, 208, 0.12) 38%, rgba(55, 85, 110, 0.045) 62%, transparent 78%)",
          filter: "blur(75px)",
        }}
      />

      {/* Cloud Layer 2: Mid-Page Right Volumetric Cloud — static */}
      <div
        className="absolute top-[22%] -right-[10%] h-[70vh] w-[75vw] rounded-full"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(215, 235, 248, 0.20) 0%, rgba(130, 170, 195, 0.11) 40%, rgba(45, 80, 105, 0.04) 65%, transparent 78%)",
          filter: "blur(85px)",
        }}
      />

      {/* Cloud Layer 3: Lower-Mid Left Volumetric Cloud — static */}
      <div
        className="absolute top-[48%] -left-[12%] h-[60vh] w-[70vw] rounded-full"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(210, 230, 245, 0.21) 0%, rgba(125, 165, 190, 0.115) 42%, rgba(40, 75, 100, 0.045) 65%, transparent 78%)",
          filter: "blur(80px)",
        }}
      />

      {/* Cloud Layer 4: Bottom-Page Atmospheric Sheet Cloud — static */}
      <div
        className="absolute -bottom-[6%] left-[5%] h-[55vh] w-[85vw] rounded-full"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(200, 225, 240, 0.19) 0%, rgba(118, 158, 182, 0.10) 48%, rgba(35, 70, 95, 0.04) 68%, transparent 80%)",
          filter: "blur(90px)",
        }}
      />

      {/* Ambient Cyan Glow — Upper-Mid — static */}
      <div
        className="absolute top-[16%] right-[6%] h-[50vh] w-[55vw] rounded-full"
        style={{
          background:
            "radial-gradient(circle at center, rgba(79, 209, 197, 0.18) 0%, rgba(56, 178, 172, 0.08) 45%, rgba(30, 120, 135, 0.02) 68%, transparent 80%)",
          filter: "blur(85px)",
        }}
      />

      {/* Ambient Ice-Blue Glow — Lower-Mid — static (desktop only) */}
      <div
        className="absolute top-[44%] left-[2%] hidden h-[55vh] w-[60vw] rounded-full sm:block"
        style={{
          background:
            "radial-gradient(circle at center, rgba(90, 220, 245, 0.19) 0%, rgba(45, 160, 200, 0.085) 48%, rgba(20, 90, 125, 0.02) 68%, transparent 80%)",
          filter: "blur(90px)",
        }}
      />

      {/* Bottom Horizon Ambient Cyan — static */}
      <div
        className="absolute bottom-[1%] left-[12%] h-[48vh] w-[70vw] rounded-full"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(79, 209, 197, 0.04) 0%, rgba(50, 170, 190, 0.02) 52%, transparent 82%)",
          filter: "blur(95px)",
        }}
      />

      {/* Cinematic Noise Grain Texture — desktop only */}
      <div
        className="pointer-events-none absolute inset-0 hidden h-full w-full opacity-[0.03] md:block"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          mixBlendMode: "overlay",
        }}
      />

      {/* Multi-Stage Screen Edge Vignette */}
      <div
        className="absolute inset-0 h-full w-full"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, transparent 40%, rgba(3, 5, 7, 0.25) 75%, rgba(2, 4, 6, 0.55) 100%)",
        }}
      />
    </div>
  );
}
