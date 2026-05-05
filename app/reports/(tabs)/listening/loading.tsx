function Skel({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse rounded bg-zinc-800/70 ${className ?? ""}`} style={style} />;
}

function PillRow({ count, widths }: { count: number; widths?: number[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skel
          key={i}
          className={`h-8 rounded-full`}
          style={{ width: widths?.[i] ?? 80 }}
        />
      ))}
    </div>
  );
}

export default function ListeningReportsLoading() {
  return (
    <div className="space-y-6">
      {/* Compare bar */}
      <Skel className="h-[84px] w-full rounded-lg" />

      {/* Range pills */}
      <PillRow count={4} widths={[88, 100, 88, 72]} />

      <div className="space-y-4">
        {/* Entity type pills */}
        <PillRow count={4} widths={[72, 72, 64, 68]} />

        {/* Share/save card */}
        <Skel className="h-14 w-full rounded-xl" />

        {/* Buttons */}
        <div className="flex justify-end gap-2">
          <Skel className="h-10 w-28 rounded-lg" />
          <Skel className="h-10 w-32 rounded-lg" />
        </div>
      </div>

      {/* List rows */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
          >
            <Skel className="h-4 w-6 rounded" />
            <Skel className="h-12 w-12 shrink-0 rounded" />
            <div className="flex-1 space-y-2">
              <Skel className="h-4 rounded" style={{ width: `${35 + (i % 4) * 12}%` }} />
              <Skel className="h-3 w-14 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
