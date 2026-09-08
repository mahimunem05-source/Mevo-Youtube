import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
}

export interface SettingSelectProps {
  label: string;
  description?: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
}

export function SettingSelect({
  label,
  description,
  value,
  options,
  onChange,
}: SettingSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click outside detection
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <span className="block text-xs sm:text-sm font-semibold text-white">{label}</span>
        {description && (
          <span className="block text-[11px] text-white/60 mt-0.5 leading-snug">{description}</span>
        )}
      </div>

      <div className="relative shrink-0" ref={containerRef}>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#182227]/90 hover:bg-[#182227] hover:border-teal-400/40 px-3.5 py-2 text-xs font-semibold text-teal-400 transition-all cursor-pointer shadow-sm min-w-[180px]"
        >
          <span className="truncate">{selectedOption?.label}</span>
          <ChevronDown
            className={cn(
              "size-3.5 text-teal-400/80 transition-transform duration-200 shrink-0",
              open && "rotate-180",
            )}
          />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              role="listbox"
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="absolute right-0 top-full mt-2 w-60 max-w-[calc(100vw-2rem)] origin-top-right z-50 rounded-2xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-2xl backdrop-blur-md"
            >
              <div className="space-y-0.5">
                {options.map((opt) => {
                  const isSelected = opt.value === value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        onChange(opt.value);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between px-4 py-2.5 text-sm rounded-xl cursor-pointer transition text-left",
                        isSelected
                          ? "text-emerald-400 bg-emerald-500/10 font-semibold"
                          : "text-zinc-300 hover:text-white hover:bg-white/10",
                      )}
                    >
                      <span className="truncate">{opt.label}</span>
                      {isSelected && <Check className="size-4 text-emerald-400 shrink-0 ml-2" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
