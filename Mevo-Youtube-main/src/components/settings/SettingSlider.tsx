import React from "react";

interface SettingSliderProps {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export function SettingSlider({
  label,
  description,
  value,
  min,
  max,
  step = 1,
  unit = "s",
  onChange,
}: SettingSliderProps) {
  return (
    <div className="space-y-2 py-1">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="block text-xs sm:text-sm font-semibold text-white">{label}</span>
          {description && (
            <span className="block text-[11px] text-white/60 mt-0.5 leading-snug">
              {description}
            </span>
          )}
        </div>
        <span className="font-mono text-xs font-bold text-teal-400 shrink-0">
          {value}
          {unit}
        </span>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#4FD1C5] bg-white/10 rounded-lg h-1.5 cursor-pointer"
      />
    </div>
  );
}
