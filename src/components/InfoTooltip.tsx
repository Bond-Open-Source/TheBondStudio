"use client";

import { type ReactNode } from "react";

interface InfoTooltipProps {
  label: string;
  children: ReactNode;
}

export default function InfoTooltip({ label, children }: InfoTooltipProps) {
  return (
    <span className="relative inline-flex items-center group">
      <span
        aria-label={label}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-[10px] font-semibold text-slate-700 shadow-sm group-hover:border-slate-400 group-hover:text-slate-900 transition-colors"
      >
        i
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 scale-95 transform rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 opacity-0 shadow-2xl ring-1 ring-black/5 backdrop-blur-md transition-all duration-150 group-hover:scale-100 group-hover:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}

