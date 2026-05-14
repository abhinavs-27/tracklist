"use client";

import type { ChartType } from "@/lib/charts/weekly-chart-types";

const CHART_TABS: { value: ChartType; label: string }[] = [
  { value: "tracks", label: "Tracks" },
  { value: "artists", label: "Artists" },
  { value: "albums", label: "Albums" },
];

type Props = {
  value: ChartType;
  onChange: (type: ChartType) => void;
};

/** Shared Tracks/Artists/Albums pill selector — identical on home billboard and community billboard. */
export function ChartTypePills({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {CHART_TABS.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={
            value === t.value
              ? "rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
              : "rounded-full bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 ring-1 ring-white/10 hover:bg-zinc-700"
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export { CHART_TABS };
