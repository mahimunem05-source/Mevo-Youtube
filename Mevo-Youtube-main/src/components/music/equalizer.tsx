/** Tiny animated 4-bar equalizer used on playing cards and the player. */
export function Equalizer({ active = true }: { active?: boolean }) {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden="true">
      {[0, 0.2, 0.4, 0.15].map((delay, i) => (
        <span
          key={i}
          className="w-[3px] origin-bottom rounded-full bg-primary"
          style={{
            height: "100%",
            animation: active ? `eq 1s ease-in-out ${delay}s infinite` : undefined,
            transform: active ? "translateZ(0)" : "scaleY(0.3)",
            willChange: active ? "transform" : undefined,
          }}
        />
      ))}
    </span>
  );
}
