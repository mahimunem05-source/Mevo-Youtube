import { memo } from "react";
import { cn } from "@/lib/utils";

interface HumanCartoonDancerProps {
  isPlaying: boolean;
  bpm?: number;
  className?: string;
}

export const HumanCartoonDancer = memo(function HumanCartoonDancer({
  isPlaying,
  bpm = 120,
  className,
}: HumanCartoonDancerProps) {
  // Sync dance cycle to song BPM
  const animDuration = isPlaying
    ? `${((60 / Math.max(60, Math.min(bpm, 180))) * 2).toFixed(2)}s`
    : "3.5s";

  return (
    <div
      style={{ animationDuration: animDuration }}
      className={cn(
        "relative flex size-52 sm:size-60 items-center justify-center select-none will-change-transform",
        isPlaying ? "animate-human-body" : "animate-chick-idle",
        className,
      )}
    >
      <svg
        viewBox="0 0 260 300"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-full filter drop-shadow-[0_12px_28px_rgba(0,245,255,0.3)]"
      >
        <defs>
          {/* Neon & Metallic Gradients */}
          <linearGradient id="neonTeal" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00F5FF" />
            <stop offset="100%" stopColor="#00A896" />
          </linearGradient>

          <linearGradient id="skinTone" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE0BD" />
            <stop offset="100%" stopColor="#F5C6A0" />
          </linearGradient>

          <linearGradient id="hairGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1E2A38" />
            <stop offset="60%" stopColor="#111B24" />
            <stop offset="100%" stopColor="#00F5FF" />
          </linearGradient>

          <linearGradient id="jacketGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#18232C" />
            <stop offset="50%" stopColor="#101920" />
            <stop offset="100%" stopColor="#0A1116" />
          </linearGradient>

          <linearGradient id="pantsGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#131E24" />
            <stop offset="100%" stopColor="#0A1014" />
          </linearGradient>

          <linearGradient id="sneakerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="70%" stopColor="#E2F1F8" />
            <stop offset="100%" stopColor="#00F5FF" />
          </linearGradient>

          {/* Neon Glow Filter */}
          <filter id="tealGlowFilter" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* ── 1. LEGS (DANCING STEPS & KNEE BENDS) ───────────────────────── */}
        {/* Left Leg (Hips to Sneaker) */}
        <g
          className={cn(
            "origin-[110px_165px] transition-transform",
            isPlaying && "animate-human-leg-left",
          )}
        >
          {/* Thigh */}
          <path
            d="M 104 165 L 94 215 L 114 215 L 120 165 Z"
            fill="url(#pantsGrad)"
            stroke="#00F5FF"
            strokeWidth="1.5"
          />
          {/* Shin */}
          <path d="M 94 215 L 88 258 L 108 258 L 114 215 Z" fill="url(#pantsGrad)" />
          {/* Neon Cargo Strap */}
          <path d="M 92 232 L 112 236" stroke="#00F5FF" strokeWidth="2" />

          {/* Left Sneaker */}
          <g>
            <path
              d="M 76 256 C 76 252, 102 250, 110 256 L 114 272 L 72 272 Z"
              fill="url(#sneakerGrad)"
              stroke="#00F5FF"
              strokeWidth="1.5"
            />
            {/* Sole Glow */}
            <rect
              x="70"
              y="268"
              width="46"
              height="6"
              rx="3"
              fill="#00F5FF"
              filter="url(#tealGlowFilter)"
            />
          </g>
        </g>

        {/* Right Leg (Weight Transfer & Foot Kick) */}
        <g
          className={cn(
            "origin-[150px_165px] transition-transform",
            isPlaying && "animate-human-leg-right",
          )}
        >
          {/* Thigh */}
          <path
            d="M 140 165 L 146 215 L 166 215 L 156 165 Z"
            fill="url(#pantsGrad)"
            stroke="#00F5FF"
            strokeWidth="1.5"
          />
          {/* Shin */}
          <path d="M 146 215 L 152 258 L 172 258 L 166 215 Z" fill="url(#pantsGrad)" />
          {/* Neon Cargo Strap */}
          <path d="M 148 232 L 168 236" stroke="#00F5FF" strokeWidth="2" />

          {/* Right Sneaker */}
          <g>
            <path
              d="M 150 256 C 158 250, 184 252, 184 256 L 188 272 L 146 272 Z"
              fill="url(#sneakerGrad)"
              stroke="#00F5FF"
              strokeWidth="1.5"
            />
            {/* Sole Glow */}
            <rect
              x="144"
              y="268"
              width="46"
              height="6"
              rx="3"
              fill="#00F5FF"
              filter="url(#tealGlowFilter)"
            />
          </g>
        </g>

        {/* ── 2. TORSO & STREETWEAR JACKET ───────────────────────────────── */}
        <g id="dancerTorso">
          {/* Belt */}
          <rect
            x="100"
            y="156"
            width="60"
            height="10"
            rx="3"
            fill="#0E161C"
            stroke="#00F5FF"
            strokeWidth="1"
          />
          <rect x="124" y="157" width="12" height="8" rx="2" fill="#00F5FF" />

          {/* Inner Shirt with Soundwave EQ */}
          <path d="M 112 108 L 148 108 L 142 158 L 118 158 Z" fill="#060C10" />
          {/* Neon Equalizer Wave on chest */}
          <g opacity="0.9">
            <line
              x1="124"
              y1="130"
              x2="124"
              y2="142"
              stroke="#00F5FF"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1="130"
              y1="126"
              x2="130"
              y2="146"
              stroke="#00F5FF"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <line
              x1="136"
              y1="132"
              x2="136"
              y2="140"
              stroke="#00F5FF"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>

          {/* Streetwear Jacket / Hoodie */}
          <path
            d="M 92 106 Q 130 114, 168 106 L 162 160 Q 130 166, 98 160 Z"
            fill="url(#jacketGrad)"
            stroke="url(#neonTeal)"
            strokeWidth="2.5"
          />
          {/* Neon Collar Trim */}
          <path
            d="M 104 106 L 120 128 L 130 156 L 140 128 L 156 106"
            stroke="#00F5FF"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#tealGlowFilter)"
          />
        </g>

        {/* ── 3. LEFT ARM (WAVING / POINTING GESTURE) ────────────────────── */}
        <g
          className={cn(
            "origin-[96px_110px] transition-transform",
            isPlaying && "animate-human-arm-left",
          )}
        >
          {/* Upper Arm Sleeve */}
          <path
            d="M 96 108 L 62 136 L 76 148 L 102 120 Z"
            fill="url(#jacketGrad)"
            stroke="#00F5FF"
            strokeWidth="1.5"
          />
          {/* Forearm (Skin) */}
          <path d="M 68 140 L 46 172 L 58 178 L 76 148 Z" fill="url(#skinTone)" />
          {/* Wristband */}
          <rect x="48" y="166" width="14" height="6" rx="2" fill="#00F5FF" />
          {/* Hand (DJ Finger Point / Peace Sign) */}
          <g>
            <circle cx="48" cy="184" r="8" fill="url(#skinTone)" />
            <path
              d="M 44 186 L 40 198"
              stroke="url(#skinTone)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M 48 186 L 46 202"
              stroke="url(#skinTone)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>
        </g>

        {/* ── 4. RIGHT ARM (BEAT PUMP / SCRATCH GESTURE) ──────────────────── */}
        <g
          className={cn(
            "origin-[164px_110px] transition-transform",
            isPlaying && "animate-human-arm-right",
          )}
        >
          {/* Upper Arm Sleeve */}
          <path
            d="M 164 108 L 198 136 L 184 148 L 158 120 Z"
            fill="url(#jacketGrad)"
            stroke="#00F5FF"
            strokeWidth="1.5"
          />
          {/* Forearm (Skin) */}
          <path d="M 192 140 L 214 172 L 202 178 L 184 148 Z" fill="url(#skinTone)" />
          {/* Wristband */}
          <rect x="198" y="166" width="14" height="6" rx="2" fill="#00F5FF" />
          {/* Hand (DJ Grip / Beat Pump) */}
          <g>
            <circle cx="212" cy="184" r="8" fill="url(#skinTone)" />
            <path
              d="M 214 182 L 222 172"
              stroke="url(#skinTone)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M 216 186 L 226 178"
              stroke="url(#skinTone)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>
        </g>

        {/* ── 5. HEAD, HAIR, HEADPHONES & FACE ───────────────────────────── */}
        <g
          className={cn(
            "origin-[130px_90px] transition-transform",
            isPlaying && "animate-human-head",
          )}
        >
          {/* Neck */}
          <rect x="122" y="92" width="16" height="20" rx="6" fill="url(#skinTone)" />

          {/* Head & Face (Friendly Anime/Cartoon Character) */}
          <path
            d="M 104 56 C 104 36, 156 36, 156 56 C 156 82, 146 96, 130 98 C 114 96, 104 82, 104 56 Z"
            fill="url(#skinTone)"
          />

          {/* Stylish Swept Anime Hair */}
          <path
            d="M 98 52 C 96 28, 140 20, 162 34 C 168 54, 154 62, 152 70 C 146 54, 138 48, 126 50 C 118 52, 110 60, 106 66 C 100 60, 98 56, 98 52 Z"
            fill="url(#hairGrad)"
          />
          {/* Front Hair Bangs */}
          <path
            d="M 106 48 Q 124 58, 136 46 Q 148 56, 154 50"
            stroke="#00F5FF"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Expressive Anime Eyes (Cool / Energetic) */}
          <g>
            {/* Left Eye */}
            <ellipse cx="118" cy="64" rx="4.5" ry="6" fill="#0A161D" />
            <circle cx="119.5" cy="62" r="2" fill="#00F5FF" />
            <circle cx="117" cy="65.5" r="1" fill="#FFFFFF" />
            <path
              d="M 112 56 Q 118 53, 124 56"
              stroke="#0E1E26"
              strokeWidth="2"
              strokeLinecap="round"
            />

            {/* Right Eye (Winking or Focused) */}
            <ellipse cx="142" cy="64" rx="4.5" ry="6" fill="#0A161D" />
            <circle cx="143.5" cy="62" r="2" fill="#00F5FF" />
            <circle cx="141" cy="65.5" r="1" fill="#FFFFFF" />
            <path
              d="M 136 56 Q 142 53, 148 56"
              stroke="#0E1E26"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>

          {/* Cute Anime Nose & Confident Smile */}
          <path d="M 130 68 L 129 72" stroke="#E2A67A" strokeWidth="1.5" strokeLinecap="round" />
          <path
            d="M 124 78 Q 130 84, 136 78"
            stroke="#C0392B"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="#FFE8E8"
          />
          {/* Subtle Cheek Blush */}
          <ellipse cx="112" cy="72" rx="4" ry="2" fill="#FF7B7B" opacity="0.4" />
          <ellipse cx="148" cy="72" rx="4" ry="2" fill="#FF7B7B" opacity="0.4" />

          {/* DJ Headphones Around Neck / Ears */}
          <path
            d="M 94 66 C 94 30, 166 30, 166 66"
            stroke="url(#neonTeal)"
            strokeWidth="5"
            strokeLinecap="round"
            fill="none"
            filter="url(#tealGlowFilter)"
          />
          {/* Left Ear Cup */}
          <rect
            x="90"
            y="56"
            width="10"
            height="24"
            rx="5"
            fill="#0A161D"
            stroke="#00F5FF"
            strokeWidth="2"
          />
          <circle cx="95" cy="68" r="3" fill="#00F5FF" />

          {/* Right Ear Cup */}
          <rect
            x="160"
            y="56"
            width="10"
            height="24"
            rx="5"
            fill="#0A161D"
            stroke="#00F5FF"
            strokeWidth="2"
          />
          <circle cx="165" cy="68" r="3" fill="#00F5FF" />
        </g>

        {/* ── 6. FLOATING DANCE BEAT NOTES & SPARKLES ───────────────────────── */}
        {isPlaying && (
          <>
            <text x="24" y="60" fill="#00F5FF" fontSize="16" fontWeight="bold" opacity="0.85">
              ♪
            </text>
            <text x="220" y="54" fill="#00F5FF" fontSize="18" fontWeight="bold" opacity="0.9">
              ♫
            </text>
            <text x="206" y="220" fill="#00F5FF" fontSize="14" fontWeight="bold" opacity="0.75">
              ♬
            </text>
            <polygon points="36,100 40,94 44,100 38,104" fill="#00F5FF" opacity="0.8" />
            <polygon points="224,116 228,110 232,116 226,120" fill="#00F5FF" opacity="0.8" />
          </>
        )}
      </svg>
    </div>
  );
});
