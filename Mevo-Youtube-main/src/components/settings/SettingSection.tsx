import React from "react";

interface SettingSectionProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function SettingSection({ title, description, icon, children }: SettingSectionProps) {
  return (
    <section className="rounded-3xl border border-white/[0.08] bg-[#12191D]/90 p-4 sm:p-5 shadow-xl space-y-4">
      <div className="flex items-center gap-3 pb-2 border-b border-white/[0.06]">
        {icon && <div className="text-teal-400">{icon}</div>}
        <div>
          <h2 className="text-sm sm:text-base font-bold text-white">{title}</h2>
          {description && <p className="text-xs text-white/60 mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}
