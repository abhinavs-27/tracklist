import type { ReactNode } from "react";

function SectionSkeleton({
  titleW,
  descW,
  children,
}: {
  titleW: string;
  descW: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div
            className={`h-6 rounded-md bg-zinc-800/70 ${titleW}`}
          />
          <div
            className={`h-4 rounded-md bg-zinc-800/45 ${descW}`}
          />
        </div>
        <div className="h-4 w-28 shrink-0 rounded-md bg-zinc-800/50" />
      </div>
      {children}
    </section>
  );
}

export default function ExploreLoading() {
  return (
    <div className="space-y-10 animate-pulse">
      <header className="space-y-3">
        <div className="h-10 w-48 rounded-lg bg-zinc-800/70" />
        <div className="h-4 w-full max-w-2xl rounded-md bg-zinc-800/45" />
        <div className="h-4 w-[80%] max-w-xl rounded-md bg-zinc-800/35" />
      </header>

      <SectionSkeleton titleW="w-28" descW="w-full max-w-md">
        <div className="-mx-1 flex gap-3 overflow-hidden px-1 pt-0.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className={`h-[7.25rem] w-[7.25rem] shrink-0 rounded-xl bg-zinc-900/55 ring-1 ring-white/[0.04] sm:h-32 sm:w-32 ${i >= 4 ? "max-sm:hidden" : ""}`}
            />
          ))}
        </div>
      </SectionSkeleton>

      <SectionSkeleton titleW="w-36" descW="w-full max-w-lg">
        <ol className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <li
              key={i}
              className={`flex items-center gap-3 rounded-xl bg-zinc-900/45 px-3 py-2.5 ring-1 ring-white/[0.04] ${i >= 3 ? "max-sm:hidden" : ""}`}
            >
              <div className="h-4 w-6 shrink-0 rounded bg-zinc-800/60" />
              <div className="h-10 w-10 shrink-0 rounded-md bg-zinc-800/55" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-4 w-[60%] max-w-xs rounded bg-zinc-800/55" />
                <div className="h-3 w-[40%] max-w-[10rem] rounded bg-zinc-800/40" />
              </div>
              <div className="h-3 w-10 shrink-0 rounded bg-zinc-800/45" />
            </li>
          ))}
        </ol>
      </SectionSkeleton>

      <SectionSkeleton titleW="w-28" descW="w-full max-w-md">
        <div className="min-h-[140px] rounded-2xl bg-zinc-900/50 p-5 ring-1 ring-white/[0.04] sm:p-6">
          <div className="h-4 w-full rounded bg-zinc-800/40" />
          <div className="mt-2 h-4 max-w-[92%] rounded bg-zinc-800/30" />
          <div className="mt-5 flex flex-wrap gap-3">
            <div className="h-10 w-36 rounded-xl bg-emerald-900/40" />
            <div className="h-10 w-24 rounded-xl bg-zinc-800/50" />
          </div>
        </div>
      </SectionSkeleton>

      <SectionSkeleton titleW="w-32" descW="w-full max-w-lg">
        <div className="min-h-[120px] rounded-2xl bg-zinc-900/50 p-5 ring-1 ring-white/[0.04] sm:p-6">
          <div className="h-4 w-full rounded bg-zinc-800/40" />
          <div className="mt-2 h-4 w-[80%] rounded bg-zinc-800/30" />
          <div className="mt-4 h-4 w-32 rounded bg-zinc-800/45" />
        </div>
      </SectionSkeleton>
    </div>
  );
}
