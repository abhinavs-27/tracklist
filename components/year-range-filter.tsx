"use client";

import { useState, useMemo } from "react";

export type YearRange = {
  startYear?: number;
  endYear?: number;
};

type Props = {
  value: YearRange;
  onChange: (range: YearRange) => void;
};

export function YearRangeFilter({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [startInput, setStartInput] = useState<string>(
    value.startYear ? String(value.startYear) : "",
  );
  const [endInput, setEndInput] = useState<string>(
    value.endYear ? String(value.endYear) : "",
  );

  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setStartInput(value.startYear ? String(value.startYear) : "");
    setEndInput(value.endYear ? String(value.endYear) : "");
    setPrevValue(value);
  }

  const label = useMemo(() => {
    const { startYear, endYear } = value;
    if (!startYear && !endYear) return "All time";
    if (startYear && !endYear) return String(startYear);
    if (!startYear && endYear) return String(endYear);
    if (startYear === endYear) return String(startYear);
    return `${startYear} – ${endYear}`;
  }, [value]);

  function handleApply() {
    const start = startInput ? parseInt(startInput, 10) : undefined;
    const end = endInput ? parseInt(endInput, 10) : undefined;

    if (start && (start < 1900 || start > 2100)) {
      return;
    }
    if (end && (end < 1900 || end > 2100)) {
      return;
    }

    let nextStart = start;
    let nextEnd = end;
    if (nextStart && nextEnd && nextStart > nextEnd) {
      [nextStart, nextEnd] = [nextEnd, nextStart];
    }

    onChange({ startYear: nextStart, endYear: nextEnd });
    setOpen(false);
  }

  function handleClear() {
    setStartInput("");
    setEndInput("");
    onChange({});
    setOpen(false);
  }

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/50 px-3 py-1.5 text-sm text-zinc-200 shadow-sm transition hover:border-zinc-500 hover:text-white"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <span>{label}</span>
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 origin-top-right rounded-xl border border-zinc-800 bg-zinc-950/95 p-4 text-sm text-zinc-200 shadow-xl backdrop-blur">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Release year
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label
                htmlFor="year-range-start"
                className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500"
              >
                Start
              </label>
              <input
                id="year-range-start"
                type="number"
                min={1900}
                max={2100}
                placeholder="e.g. 1990"
                value={startInput}
                onChange={(e) => setStartInput(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-sm text-white outline-none focus:border-emerald-500"
              />
            </div>
            <span className="mt-5 text-xs text-zinc-500">to</span>
            <div className="flex-1">
              <label
                htmlFor="year-range-end"
                className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500"
              >
                End
              </label>
              <input
                id="year-range-end"
                type="number"
                min={1900}
                max={2100}
                placeholder="e.g. 1999"
                value={endInput}
                onChange={(e) => setEndInput(e.target.value)}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/70 px-2 py-1 text-sm text-white outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <p className="mt-2 text-[11px] text-zinc-500">
            Leave both empty for all time, or set a single year for a specific year.
          </p>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md border border-zinc-700 bg-transparent px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-white"
            >
              Clear filter
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

