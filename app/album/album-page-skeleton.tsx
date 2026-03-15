/**
 * Album loading skeleton. Uses the exact same layout containers as
 * app/album/[id]/page.tsx so there is no layout shift.
 * Only content is replaced with skeleton blocks.
 */

export function AlbumPageSkeleton() {
  return (
    <div className="space-y-8">
      {/* Album header — same container as page: flex flex-col gap-6 sm:flex-row sm:items-end */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
        {/* Left column: album cover — same size as page (h-48 w-48 sm:h-56 sm:w-56) */}
        <div className="h-48 w-48 shrink-0 overflow-hidden rounded-xl bg-zinc-800 animate-pulse sm:h-56 sm:w-56" />
        {/* Right column: title, artist, year, stats — same as page (min-w-0 flex-1) */}
        <div className="min-w-0 flex-1">
          <div className="h-8 w-64 bg-zinc-800 animate-pulse rounded" />
          <div className="mt-2 h-5 w-40 bg-zinc-800 animate-pulse rounded" />
          <div className="mt-2 h-4 w-16 bg-zinc-800 animate-pulse rounded" />
          <div className="mt-4 flex gap-4">
            <div className="h-4 w-20 bg-zinc-800 animate-pulse rounded" />
            <div className="h-4 w-20 bg-zinc-800 animate-pulse rounded" />
            <div className="h-4 w-20 bg-zinc-800 animate-pulse rounded" />
          </div>
          <div className="mt-4 h-10 w-32 bg-zinc-800 animate-pulse rounded-lg" />
        </div>
      </div>

      {/* Tracklist — same container as page: section > h2.mb-3 > div.space-y-1 */}
      <section>
        <div className="mb-3 h-6 w-20 bg-zinc-800 animate-pulse rounded" />
        <div className="space-y-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-0.5 py-1.5">
              <div className="flex items-center gap-3">
                <div className="h-4 w-6 shrink-0 bg-zinc-800 animate-pulse rounded" />
                <div className="min-w-0 flex-1 h-4 bg-zinc-800 animate-pulse rounded" />
                <div className="h-4 w-12 shrink-0 hidden sm:block bg-zinc-800 animate-pulse rounded" />
              </div>
              <div className="flex items-center gap-3 pl-9">
                <div className="h-3 w-32 bg-zinc-800 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recommended albums — same grid as page */}
      <section>
        <div className="mb-2 h-6 w-44 bg-zinc-800 animate-pulse rounded" />
        <div className="mb-3 h-4 w-56 bg-zinc-800 animate-pulse rounded" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
              <div className="aspect-square w-full bg-zinc-800 animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-full bg-zinc-800 animate-pulse rounded" />
                <div className="h-3 w-2/3 bg-zinc-800 animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Reviews — same structure as EntityReviewsSection list */}
      <section>
        <div className="mb-3 h-6 w-24 bg-zinc-800 animate-pulse rounded" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-md border border-zinc-800 p-4 space-y-2">
              <div className="h-4 w-40 bg-zinc-800 animate-pulse rounded" />
              <div className="h-4 w-full bg-zinc-800 animate-pulse rounded" />
              <div className="h-4 w-3/4 bg-zinc-800 animate-pulse rounded" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
