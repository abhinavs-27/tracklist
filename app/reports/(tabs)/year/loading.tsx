function Skel({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`animate-pulse rounded bg-zinc-800/70 ${className ?? ""}`} style={style} />;
}

function ListRowSkel() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-3 py-2">
      <Skel className="h-4 w-5 rounded" />
      <Skel className="h-9 w-9 shrink-0 rounded-lg" />
      <div className="flex-1 space-y-1.5">
        <Skel className="h-3.5 rounded" style={{ width: "55%" }} />
        <Skel className="h-3 w-12 rounded" />
      </div>
    </div>
  );
}

function EntityListSkel({ accentClass, title }: { accentClass: string; title: string }) {
  return (
    <section>
      <p className={`mb-3 text-[11px] font-bold uppercase tracking-widest ${accentClass} opacity-40`}>
        {title}
      </p>
      <div className="space-y-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <ListRowSkel key={i} />
        ))}
      </div>
    </section>
  );
}

export default function YearInReviewLoading() {
  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="space-y-1.5">
        <Skel className="h-8 w-52 rounded" />
        <Skel className="h-4 w-36 rounded" />
      </div>

      {/* Hero card */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/50 p-6 sm:p-8">
        <div className="flex items-center gap-5">
          <Skel className="h-16 w-16 shrink-0 rounded-xl sm:h-20 sm:w-20" />
          <div className="space-y-2">
            <Skel className="h-3 w-28 rounded" />
            <Skel className="h-6 w-44 rounded" />
            <Skel className="h-4 w-32 rounded" />
          </div>
        </div>
      </div>

      {/* Entity grids */}
      <div className="grid gap-6 sm:grid-cols-2">
        <EntityListSkel title="Top Artists" accentClass="text-gold-500" />
        <EntityListSkel title="Top Albums" accentClass="text-violet-400" />
        <EntityListSkel title="Top Tracks" accentClass="text-sky-400" />
        <EntityListSkel title="Top Genres" accentClass="text-amber-400" />
      </div>
    </div>
  );
}
