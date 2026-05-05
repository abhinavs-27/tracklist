function Skel({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse rounded bg-zinc-800/70 ${className ?? ""}`} style={style} />;
}

export default function WeeklyReportLoading() {
  return (
    <div className="space-y-6">
      {/* Period selector pills */}
      <div className="flex flex-wrap items-center gap-2">
        <Skel className="h-4 w-12 rounded" />
        <Skel className="h-8 w-16 rounded-lg" />
        <Skel className="h-8 w-16 rounded-lg" />
        <Skel className="h-8 w-14 rounded-lg" />
      </div>

      {/* Period label + nav */}
      <div className="flex flex-wrap items-center gap-3">
        <Skel className="h-4 w-40 rounded" />
        <Skel className="h-8 w-28 rounded-lg" />
      </div>

      {/* Title + summary */}
      <div className="space-y-3">
        <Skel className="h-8 w-56 rounded" />
        <Skel className="h-7 w-4/5 rounded" />
        <Skel className="h-4 w-3/5 rounded" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {["Total listens", "Unique artists", "New artists", "Best day streak"].map((label) => (
          <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-600">{label}</p>
            <Skel className="mt-2 h-8 w-12 rounded" />
          </div>
        ))}
      </div>

      {/* Top picks */}
      <div>
        <Skel className="mb-3 h-3 w-20 rounded" />
        <div className="grid gap-4 sm:grid-cols-3">
          {["Artist", "Album", "Track"].map((label) => (
            <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-600">{label}</p>
              <div className="mt-3 flex items-center gap-3">
                <Skel className="h-14 w-14 shrink-0 rounded-lg" />
                <Skel className="h-5 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Insights placeholder */}
      <div className="space-y-2">
        <Skel className="h-3 w-16 rounded" />
        <Skel className="h-4 w-3/4 rounded" />
        <Skel className="h-4 w-2/3 rounded" />
      </div>

      {/* Week over week bar */}
      <Skel className="h-11 w-full rounded-lg" />
    </div>
  );
}
