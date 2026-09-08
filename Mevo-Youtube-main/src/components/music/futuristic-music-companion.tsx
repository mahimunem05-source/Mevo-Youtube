import { memo } from "react";
import { cn } from "@/lib/utils";

interface FuturisticMusicCompanionProps {
  isPlaying: boolean;
  bpm?: number;
  className?: string;
}

export const FuturisticMusicCompanion = memo(function FuturisticMusicCompanion({
  isPlaying,
  bpm = 120,
  className,
}: FuturisticMusicCompanionProps) {
  // Sync animation tempo to song BPM
  const animDuration = isPlaying
    ? `${((60 / Math.max(60, Math.min(bpm, 180))) * 2).toFixed(2)}s`
    : "3.5s";

  return (
    <div
      style={{ animationDuration: animDuration }}
      className={cn(
        "relative flex size-48 sm:size-56 items-center justify-center select-none will-change-transform",
        isPlaying ? "animate-chick-groove" : "animate-chick-idle",
        className,
      )}
    >
      <svg
        viewBox="0 0 240 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-full filter drop-shadow-[0_12px_28px_rgba(0,240,255,0.35)]"
      >
        <defs>
          {/* Gradients */}
          <linearGradient id="neonCyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00F5FF" />
            <stop offset="100%" stopColor="#0088AA" />
          </linearGradient>

          <linearGradient id="cyberChassis" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1C2D35" />
            <stop offset="50%" stopColor="#101D24" />
            <stop offset="100%" stopColor="#081014" />
          </linearGradient>

          <linearGradient id="visorGlass" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#061217" />
            <stop offset="100%" stopColor="#02080B" />
          </linearGradient>

          <linearGradient id="coreGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00FFFF" />
            <stop offset="50%" stopColor="#00B4D8" />
            <stop offset="100%" stopColor="#0077B6" />
          </linearGradient>

          {/* Filter Glow */}
          <filter id="cyanNeonGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* ── 1. FLOATING AUDIO ENERGY RINGS ──────────────────────────── */}
        <g className={isPlaying ? "opacity-90" : "opacity-40"}>
          <ellipse
            cx="120"
            cy="120"
            rx="92"
            ry="92"
            stroke="url(#neonCyanGrad)"
            strokeWidth="1.5"
            strokeDasharray="6 14"
            opacity="0.5"
            className={isPlaying ? "animate-spin" : ""}
            style={{ animationDuration: "12s" }}
          />
          <ellipse
            cx="120"
            cy="120"
            rx="102"
            ry="102"
            stroke="#00F5FF"
            strokeWidth="1"
            strokeDasharray="2 18"
            opacity="0.35"
          />
        </g>

        {/* ── 2. HEADPHONE ARCH ───────────────────────────────────────── */}
        <path
          d="M 52 110 C 52 56, 188 56, 188 110"
          stroke="url(#neonCyanGrad)"
          strokeWidth="8"
          strokeLinecap="round"
          filter="url(#cyanNeonGlow)"
        />
        <path
          d="M 58 110 C 58 64, 182 64, 182 110"
          stroke="#0A161B"
          strokeWidth="3.5"
          strokeLinecap="round"
        />

        {/* Top Antenna */}
        <line
          x1="120"
          y1="64"
          x2="120"
          y2="42"
          stroke="#00F5FF"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle
          cx="120"
          cy="38"
          r="5"
          fill="#00F5FF"
          filter="url(#cyanNeonGlow)"
          className={isPlaying ? "animate-ping" : ""}
          style={{ animationDuration: "1.2s" }}
        />
        <circle cx="120" cy="38" r="4" fill="#FFFFFF" />

        {/* ── 3. BODY / CHASSIS ────────────────────────────────────────── */}
        {/* Torso */}
        <rect
          x="76"
          y="136"
          width="88"
          height="76"
          rx="26"
          fill="url(#cyberChassis)"
          stroke="url(#neonCyanGrad)"
          strokeWidth="2.5"
        />

        {/* Cyber Wings / DJ Arms */}
        {/* Left Arm */}
        <g className={cn("origin-[64px_145px] transition-transform", isPlaying && "animate-pulse")}>
          <rect
            x="42"
            y="142"
            width="26"
            height="46"
            rx="13"
            fill="url(#cyberChassis)"
            stroke="#00F5FF"
            strokeWidth="2"
            transform="rotate(-18 42 142)"
          />
          <circle cx="48" cy="180" r="5" fill="#00F5FF" filter="url(#cyanNeonGlow)" />
        </g>

        {/* Right Arm */}
        <g
          className={cn("origin-[176px_145px] transition-transform", isPlaying && "animate-pulse")}
        >
          <rect
            x="172"
            y="142"
            width="26"
            height="46"
            rx="13"
            fill="url(#cyberChassis)"
            stroke="#00F5FF"
            strokeWidth="2"
            transform="rotate(18 172 142)"
          />
          <circle cx="192" cy="180" r="5" fill="#00F5FF" filter="url(#cyanNeonGlow)" />
        </g>

        {/* Chest Reactor Core */}
        <circle cx="120" cy="174" r="19" fill="#051014" stroke="#00F5FF" strokeWidth="2" />
        <circle
          cx="120"
          cy="174"
          r="13"
          fill="url(#coreGlow)"
          filter="url(#cyanNeonGlow)"
          className={isPlaying ? "animate-pulse" : ""}
          style={{ animationDuration: "0.8s" }}
        />
        <circle cx="120" cy="174" r="6" fill="#FFFFFF" opacity="0.9" />

        {/* Chest Equalizer Meter */}
        <g opacity="0.85">
          <rect x="90" y="196" width="3" height={isPlaying ? "10" : "4"} rx="1.5" fill="#00F5FF" />
          <rect x="96" y="196" width="3" height={isPlaying ? "14" : "5"} rx="1.5" fill="#00F5FF" />
          <rect x="102" y="196" width="3" height={isPlaying ? "8" : "3"} rx="1.5" fill="#00F5FF" />
          <rect x="135" y="196" width="3" height={isPlaying ? "8" : "3"} rx="1.5" fill="#00F5FF" />
          <rect x="141" y="196" width="3" height={isPlaying ? "14" : "5"} rx="1.5" fill="#00F5FF" />
          <rect x="147" y="196" width="3" height={isPlaying ? "10" : "4"} rx="1.5" fill="#00F5FF" />
        </g>

        {/* ── 4. HEAD & VISOR ──────────────────────────────────────────── */}
        {/* Main Helmet Base */}
        <rect
          x="62"
          y="74"
          width="116"
          height="80"
          rx="34"
          fill="url(#cyberChassis)"
          stroke="url(#neonCyanGrad)"
          strokeWidth="3"
        />

        {/* Glossy Visor Face */}
        <rect
          x="72"
          y="84"
          width="96"
          height="54"
          rx="22"
          fill="url(#visorGlass)"
          stroke="#00F5FF"
          strokeWidth="1.8"
        />

        {/* Visor Animated Soundwave Equalizer Eyes */}
        <g filter="url(#cyanNeonGlow)">
          {/* Left Eye EQ Wave */}
          <rect
            x="86"
            y="102"
            width="5"
            height={isPlaying ? "20" : "8"}
            rx="2.5"
            fill="#00F5FF"
            className={isPlaying ? "animate-eq-1" : ""}
          />
          <rect
            x="94"
            y="97"
            width="5"
            height={isPlaying ? "28" : "12"}
            rx="2.5"
            fill="#00F5FF"
            className={isPlaying ? "animate-eq-3" : ""}
          />
          <rect
            x="102"
            y="104"
            width="5"
            height={isPlaying ? "16" : "8"}
            rx="2.5"
            fill="#00F5FF"
            className={isPlaying ? "animate-eq-2" : ""}
          />

          {/* Center Sound Hub Dot */}
          <circle cx="120" cy="111" r="3" fill="#00F5FF" />

          {/* Right Eye EQ Wave */}
          <rect
            x="133"
            y="104"
            width="5"
            height={isPlaying ? "16" : "8"}
            rx="2.5"
            fill="#00F5FF"
            className={isPlaying ? "animate-eq-2" : ""}
          />
          <rect
            x="141"
            y="97"
            width="5"
            height={isPlaying ? "28" : "12"}
            rx="2.5"
            fill="#00F5FF"
            className={isPlaying ? "animate-eq-3" : ""}
          />
          <rect
            x="149"
            y="102"
            width="5"
            height={isPlaying ? "20" : "8"}
            rx="2.5"
            fill="#00F5FF"
            className={isPlaying ? "animate-eq-1" : ""}
          />
        </g>

        {/* Visor Glare Accent */}
        <path
          d="M 80 94 Q 120 90, 160 94"
          stroke="#FFFFFF"
          strokeWidth="1.5"
          opacity="0.35"
          strokeLinecap="round"
        />

        {/* ── 5. HEADPHONES (EAR CUPS) ─────────────────────────────────── */}
        {/* Left Ear Cup */}
        <rect
          x="44"
          y="92"
          width="20"
          height="48"
          rx="10"
          fill="url(#cyberChassis)"
          stroke="#00F5FF"
          strokeWidth="2.5"
        />
        <circle cx="54" cy="116" r="6" fill="#00F5FF" filter="url(#cyanNeonGlow)" />
        <circle cx="54" cy="116" r="3" fill="#FFFFFF" />

        {/* Right Ear Cup */}
        <rect
          x="176"
          y="92"
          width="20"
          height="48"
          rx="10"
          fill="url(#cyberChassis)"
          stroke="#00F5FF"
          strokeWidth="2.5"
        />
        <circle cx="186" cy="116" r="6" fill="#00F5FF" filter="url(#cyanNeonGlow)" />
        <circle cx="186" cy="116" r="3" fill="#FFFFFF" />

        {/* ── 6. FLOATING NEON MUSIC PARTICLES ─────────────────────────── */}
        {isPlaying && (
          <>
            <text x="32" y="70" fill="#00F5FF" fontSize="14" fontWeight="bold" opacity="0.8">
              ♪
            </text>
            <text x="194" y="66" fill="#00F5FF" fontSize="16" fontWeight="bold" opacity="0.85">
              ♫
            </text>
            <text x="178" y="196" fill="#00F5FF" fontSize="12" fontWeight="bold" opacity="0.7">
              ♬
            </text>
          </>
        )}
      </svg>
    </div>
  );
});
