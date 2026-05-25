"use client";

import type { ListeningReportsResult } from "@/lib/analytics/getListeningReports";

function formatMovement(m: number | null, isNew: boolean): string {
  if (isNew) return "New";
  if (m == null || m === 0) return "—";
  if (m > 0) return `↑${m}`;
  return `↓${Math.abs(m)}`;
}

function movementColor(m: number | null, isNew: boolean): string {
  if (isNew) return "text-violet-400";
  if (m != null && m > 0) return "text-gold-400";
  if (m != null && m < 0) return "text-red-400";
  return "text-zinc-600";
}

export function SharedListeningReportView(props: {
  payload: ListeningReportsResult;
  readOnly?: boolean;
}) {
  const { items } = props.payload;

  if (items.length === 0) {
    return <p className="text-sm text-zinc-500">No plays in this period.</p>;
  }

  return (
    <ol className="space-y-1.5">
      {items.map((row) => (
        <li
          key={row.entityId}
          className="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5 transition hover:bg-zinc-800/40"
        >
          <span className="w-7 shrink-0 text-center text-sm tabular-nums text-zinc-500">
            {row.rank}
          </span>
          {row.image ? (
            <img
              src={row.image}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-600">
              ♪
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-white">{row.name}</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              {row.count.toLocaleString()} plays
            </p>
          </div>
          <span className={`shrink-0 text-xs font-medium tabular-nums ${movementColor(row.movement, row.isNew)}`}>
            {formatMovement(row.movement, row.isNew)}
          </span>
        </li>
      ))}
    </ol>
  );
}
