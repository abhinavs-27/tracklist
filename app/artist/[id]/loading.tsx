/**
 * Artist loading skeleton. Uses the exact same layout containers as
 * app/artist/[id]/page.tsx so there is no layout shift.
 * Only content is replaced with skeleton blocks.
 */

export default function ArtistLoading() {
  return (
    <div className="space-y-8">
      {/* Artist header — same container as page: flex flex-col gap-6 sm:flex-row sm:items-end */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
        {/* Left column: artist image — same container as page (h-48 w-48 sm:h-56 sm:w-56 rounded-xl) */}
        <div className="h-48 w-48 shrink-0 overflow-hidden rounded-xl bg-zinc-800 animate-pulse sm:h-56 sm:w-56" />
        {/* Right column: name, genres, followers — same as page (min-w-0) */}
        <div className="min-w-0">
          <div className="h-8 w-48 bg-zinc-800 animate-pulse rounded" />
          <div className="mt-2 h-5 w-36 bg-zinc-800 animate-pulse rounded" />
          <div className="mt-2 h-4 w-44 bg-zinc-800 animate-pulse rounded" />
        </div>
      </div>

      {/* Popular tracks — same container as page: section > h2.mb-3 > div.space-y-2 */}
      <section>
        <div className="mb-3 h-6 w-36 bg-zinc-800 animate-pulse rounded" />
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
            >
              <div className="h-12 w-12 shrink-0 rounded bg-zinc-800 animate-pulse" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="h-4 w-2/3 bg-zinc-800 animate-pulse rounded" />
                <div className="h-3 w-1/3 bg-zinc-800 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Albums — same container as page: section > h2.mb-3 > grid */}
      <section>
        <div className="mb-3 h-6 w-28 bg-zinc-800 animate-pulse rounded" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40"
            >
              <div className="aspect-square w-full bg-zinc-800 animate-pulse" />
              <div className="p-3 space-y-1">
                <div className="h-4 w-full bg-zinc-800 animate-pulse rounded" />
                <div className="h-3 w-2/3 bg-zinc-800 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent reviews — same container as page */}
      <section>
        <div className="mb-3 h-6 w-32 bg-zinc-800 animate-pulse rounded" />
        <ul className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="h-4 w-24 bg-zinc-800 animate-pulse rounded" />
                <div className="h-4 w-20 bg-zinc-800 animate-pulse rounded" />
              </div>
              <div className="h-3 w-full bg-zinc-800 animate-pulse rounded" />
            </li>
          ))}
        </ul>
      </section>

      {/* Recent listens — same container as page */}
      <section>
        <div className="mb-3 h-6 w-28 bg-zinc-800 animate-pulse rounded" />
        <ul className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="h-10 w-10 shrink-0 rounded bg-zinc-800 animate-pulse" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="h-4 w-1/2 bg-zinc-800 animate-pulse rounded" />
                <div className="h-3 w-1/3 bg-zinc-800 animate-pulse rounded" />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
