"use client";

import { useCallback, useEffect } from "react";
import { ChartShareActions } from "@/components/charts/chart-share-actions";
import { ChartShareImageDownload } from "@/components/charts/chart-share-image-download";
import type {
  ChartMomentPayload,
  ChartType,
} from "@/lib/charts/weekly-chart-types";

export function ChartShareModal(props: {
  open: boolean;
  onClose: () => void;
  chartKind: string;
  chartType: ChartType;
  weekStartIso: string | null;
  chart_moment: ChartMomentPayload;
  disableFormattedShare?: boolean;
}) {
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    },
    [props],
  );

  useEffect(() => {
    if (!props.open) return;
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [props.open, onKey]);

  if (!props.open) return null;

  const leaderRank = props.chart_moment.top_5[0]?.rank;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chart-share-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        aria-label="Close"
        onClick={props.onClose}
      />
      <div className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-zinc-700/80 bg-zinc-950 shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2
            id="chart-share-title"
            className="text-lg font-semibold tracking-tight text-white"
          >
            Share your chart
          </h2>
          <button
            type="button"
            onClick={props.onClose}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
            aria-label="Close"
          >
            <span aria-hidden className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>
        <div className="space-y-5 overflow-y-auto px-5 py-5">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Share card image
            </p>
            <ChartShareImageDownload
              chartType={props.chartType}
              weekStart={props.weekStartIso}
              disabled={props.disableFormattedShare}
            />
            <p className="text-xs text-zinc-600">
              1080×1350 PNG — optimized for Instagram and stories.
            </p>
          </div>
          <ChartShareActions
            chartKind={props.chartKind}
            chart_moment={props.chart_moment}
            disableFormattedShare={props.disableFormattedShare}
            layout="stacked"
          />
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Preview
            </p>
            <p className="mt-2 text-sm text-zinc-300">
              {props.chart_moment.week_label}
            </p>
            <ol className="mt-3 space-y-2">
              {props.chart_moment.top_5.map((row) => {
                const isLeader =
                  leaderRank != null && row.rank === leaderRank;
                return (
                  <li
                    key={row.rank}
                    className={
                      isLeader
                        ? "flex flex-wrap items-baseline gap-x-2 rounded-lg bg-amber-500/10 px-2 py-1.5 text-amber-100"
                        : "flex flex-wrap items-baseline gap-x-2 text-sm text-zinc-300"
                    }
                  >
                    <span className="w-5 shrink-0 text-zinc-500">
                      {row.rank}.
                    </span>
                    <span className="min-w-0 truncate font-medium">
                      {row.name}
                    </span>
                    {row.artist_name ? (
                      <span className="min-w-0 truncate text-zinc-500">
                        — {row.artist_name}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            {props.chart_moment.number_one ? (
              <p className="mt-3 text-xs text-zinc-500">
                Weeks at #1 (all-time):{" "}
                {props.chart_moment.number_one.weeks_at_1}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
