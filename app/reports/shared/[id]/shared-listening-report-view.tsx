"use client";

import type { ListeningReportsResult } from "@/lib/analytics/getListeningReports";

function formatMovement(m: number | null, isNew: boolean): string {
  if (isNew) return "—";
  if (m == null || m === 0) return "—";
  if (m > 0) return `↑ +${m}`;
  return `↓ ${m}`;
}

export function SharedListeningReportView(props: {
  payload: ListeningReportsResult;
  readOnly?: boolean;
}) {
  const { items, periodLabel } = props.payload;

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">{periodLabel}</p>
      {items.length === 0 ? (
        <p className="text-zinc-500">No plays in this period.</p>
      ) : (
        <ol className="space-y-2">
          {items.map((row) => (
            <li
              key={row.entityId}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
            >
              <span className="w-8 text-sm tabular-nums text-zinc-500">
                {row.rank}
              </span>
              {row.image ? (
                <img
                  src={row.image}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-zinc-800 text-zinc-500">
                  ♪
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-white">{row.name}</p>
                  {row.isNew ? (
                    <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-300">
                      New
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-zinc-500">{row.count} plays</p>
              </div>
              <span
                className={`shrink-0 text-sm tabular-nums ${
                  row.movement != null && row.movement > 0
                    ? "text-emerald-400"
                    : row.movement != null && row.movement < 0
                      ? "text-red-400"
                      : "text-zinc-500"
                }`}
              >
                {formatMovement(row.movement, row.isNew)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
