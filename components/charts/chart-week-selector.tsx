"use client";

import { formatWeeklyChartWeekLabel } from "@/lib/charts/week-label";

type WeekOption = { week_start: string; week_end: string };

type Props = {
  weeks: WeekOption[];
  weekStart: string | null;
  effectiveIndex: number;
  disabled?: boolean;
  onSelect?: (weekStart: string | null) => void;
  onNewer: () => void;
  onOlder: () => void;
};

export function ChartWeekSelector({ weeks, weekStart, effectiveIndex, disabled, onSelect, onNewer, onOlder }: Props) {
  const firstWeek = weeks[0]?.week_start;
  const isDisabled = disabled || weeks.length === 0;
  const current = weeks[effectiveIndex];
  const isLatest = effectiveIndex === 0 && weeks.length > 0;

  const label = current
    ? formatWeeklyChartWeekLabel(current.week_start, current.week_end) + (isLatest ? " · latest" : "")
    : "—";

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Week</span>
      <div className="flex overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-900 ring-1 ring-white/[0.04]">
        {/* ‹ newer */}
        <button
          type="button"
          onClick={onNewer}
          disabled={isDisabled || effectiveIndex <= 0}
          aria-label="Newer week"
          className="flex w-10 shrink-0 items-center justify-center border-r border-zinc-700/80 text-lg text-zinc-400 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-25 disabled:cursor-not-allowed"
        >
          ‹
        </button>

        {/* Center — text + invisible select overlay for click-to-pick */}
        <div className="relative flex min-w-0 flex-1 items-center justify-center py-2.5 px-3">
          <span className="pointer-events-none select-none text-sm font-semibold text-white">
            {label}
          </span>
          {weeks.length > 1 && !isDisabled && onSelect && (
            <select
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              value={weekStart ?? firstWeek ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                onSelect(v === firstWeek ? null : v);
              }}
            >
              {weeks.map((w, i) => (
                <option key={w.week_start} value={w.week_start}>
                  {formatWeeklyChartWeekLabel(w.week_start, w.week_end)}{i === 0 ? " · latest" : ""}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* › older */}
        <button
          type="button"
          onClick={onOlder}
          disabled={isDisabled || effectiveIndex >= weeks.length - 1}
          aria-label="Older week"
          className="flex w-10 shrink-0 items-center justify-center border-l border-zinc-700/80 text-lg text-zinc-400 transition hover:bg-white/[0.05] hover:text-white disabled:opacity-25 disabled:cursor-not-allowed"
        >
          ›
        </button>
      </div>
    </div>
  );
}
