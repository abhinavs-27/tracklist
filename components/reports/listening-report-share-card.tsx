"use client";

import { forwardRef } from "react";

export type ListeningReportShareCardRow = {
  rank: number;
  name: string;
  image: string | null;
  count: number;
};

export type ListeningReportShareCardProps = {
  reportTitle: string;
  periodLabel: string;
  entityLabel: string;
  rows: ListeningReportShareCardRow[];
  /** Shown in footer when present (e.g. public saved report URL). */
  shareUrl?: string | null;
};

const W = 1080;
const H = 1350;

function InitialAvatar({ name }: { name: string }) {
  const ch = name.trim().charAt(0).toUpperCase() || "♪";
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-400"
      style={{ width: 72, height: 72, fontSize: 28, fontWeight: 600 }}
    >
      {ch}
    </div>
  );
}

export const ListeningReportShareCard = forwardRef<
  HTMLDivElement,
  ListeningReportShareCardProps
>(function ListeningReportShareCard(props, ref) {
  const { reportTitle, periodLabel, entityLabel, rows, shareUrl } = props;

  return (
    <div
      ref={ref}
      className="box-border flex flex-col overflow-hidden rounded-3xl border border-zinc-700/80 bg-zinc-950 text-white"
      style={{
        width: W,
        height: H,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: 56,
        background:
          "linear-gradient(165deg, #09090b 0%, #18181b 42%, #052e2a 100%)",
      }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span
          className="font-semibold tracking-tight text-emerald-400"
          style={{ fontSize: 36 }}
        >
          Tracklist
        </span>
        <span className="text-zinc-500" style={{ fontSize: 22 }}>
          {entityLabel}
        </span>
      </div>

      <h1
        className="mt-10 font-bold leading-tight tracking-tight text-white"
        style={{ fontSize: 52, lineHeight: 1.12 }}
      >
        {reportTitle}
      </h1>
      <p className="mt-3 text-zinc-400" style={{ fontSize: 26 }}>
        {periodLabel}
      </p>

      <div className="mt-12 flex flex-1 flex-col gap-5">
        {rows.map((row) => (
          <div
            key={`${row.rank}-${row.name}`}
            className="flex items-center gap-5 rounded-2xl border border-zinc-800/90 bg-black/25 px-5 py-4"
          >
            <span
              className="w-14 shrink-0 tabular-nums text-zinc-500"
              style={{ fontSize: 28 }}
            >
              {row.rank}
            </span>
            {row.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.image}
                alt=""
                crossOrigin="anonymous"
                referrerPolicy="no-referrer"
                className="shrink-0 rounded-lg object-cover"
                style={{ width: 72, height: 72 }}
              />
            ) : (
              <InitialAvatar name={row.name} />
            )}
            <div className="min-w-0 flex-1">
              <p
                className="truncate font-semibold text-white"
                style={{ fontSize: 28 }}
              >
                {row.name}
              </p>
              <p className="mt-1 text-zinc-500" style={{ fontSize: 22 }}>
                {row.count.toLocaleString()} plays
              </p>
            </div>
          </div>
        ))}
      </div>

      <div
        className="mt-auto border-t border-zinc-800/80 pt-8 text-zinc-500"
        style={{ fontSize: 20 }}
      >
        {shareUrl ? (
          <p className="break-all text-emerald-500/90">{shareUrl}</p>
        ) : (
          <p>tracklist.app</p>
        )}
      </div>
    </div>
  );
});
