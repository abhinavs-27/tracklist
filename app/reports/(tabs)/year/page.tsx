import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getSession } from "@/lib/auth";
import { getListeningReports } from "@/lib/analytics/getListeningReports";
import type { ReportEntityType } from "@/lib/analytics/listening-report-types";

type EntityItem = {
  entityId: string;
  name: string;
  image: string | null;
  count: number;
  rank: number;
};

function isReal(item: EntityItem) {
  return !item.entityId.startsWith("__tl_");
}

function EntityList({
  title,
  items,
  accentClass,
}: {
  title: string;
  items: EntityItem[];
  accentClass: string;
}) {
  const real = items.filter(isReal);
  if (real.length === 0) return null;
  return (
    <section>
      <h2 className={`mb-3 text-[11px] font-bold uppercase tracking-widest ${accentClass}`}>
        {title}
      </h2>
      <ol className="space-y-1">
        {real.slice(0, 5).map((item, i) => (
          <li
            key={item.entityId}
            className="flex items-center gap-3 rounded-xl border border-zinc-800/70 bg-zinc-900/40 px-3 py-2"
          >
            <span className="w-5 shrink-0 text-center text-xs tabular-nums text-zinc-600">
              {i + 1}
            </span>
            {item.image ? (
              <img
                src={item.image}
                alt=""
                className="h-9 w-9 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-xs text-zinc-600">
                ♪
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{item.name}</p>
              <p className="text-xs text-zinc-500">{item.count.toLocaleString()} plays</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function YearInReviewPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/reports/year");
  }

  const userId = session.user.id;
  const year = new Date().getFullYear();

  const fetchYearData = unstable_cache(
    async (uid: string) =>
      Promise.all([
        getListeningReports({ userId: uid, range: "year", entityType: "artist" as ReportEntityType, limit: 20 }),
        getListeningReports({ userId: uid, range: "year", entityType: "album" as ReportEntityType, limit: 20 }),
        getListeningReports({ userId: uid, range: "year", entityType: "track" as ReportEntityType, limit: 20 }),
        getListeningReports({ userId: uid, range: "year", entityType: "genre" as ReportEntityType, limit: 10 }),
      ]),
    ["year-review"],
    { revalidate: 3600, tags: [`year-review-${userId}`] },
  );

  const [artistResult, albumResult, trackResult, genreResult] = await fetchYearData(userId);

  const topArtists = (artistResult?.items ?? []).filter(isReal);
  const topAlbums = (albumResult?.items ?? []).filter(isReal);
  const topTracks = (trackResult?.items ?? []).filter(isReal);
  const topGenres = (genreResult?.items ?? []).filter(isReal);

  const hasData = topArtists.length > 0 || topAlbums.length > 0;

  const hero = topArtists[0] ?? topAlbums[0] ?? null;
  const heroImage = hero?.image ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">
          Your {year} in music
        </h1>
        {artistResult?.periodLabel && (
          <p className="mt-0.5 text-sm text-zinc-500">{artistResult.periodLabel}</p>
        )}
      </div>

      {!hasData ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-10 text-center">
          <p className="text-zinc-400">No listening data for {year} yet.</p>
          <Link href="/search" className="mt-3 inline-block text-sm text-emerald-400 hover:underline">
            Find music to log →
          </Link>
        </div>
      ) : (
        <>
          {/* Hero */}
          {hero && (
            <div className="relative overflow-hidden rounded-2xl border border-zinc-800/60">
              {heroImage && (
                <img
                  src={heroImage}
                  alt=""
                  aria-hidden
                  className="absolute inset-0 h-full w-full scale-110 object-cover opacity-20 blur-2xl"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-zinc-950/95 via-zinc-950/80 to-zinc-950/40" />
              <div className="relative z-10 flex items-center gap-5 p-6 sm:p-8">
                {heroImage && (
                  <img
                    src={heroImage}
                    alt=""
                    className="h-16 w-16 shrink-0 rounded-xl object-cover shadow-xl sm:h-20 sm:w-20"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
                    {topArtists[0] ? "Most played artist" : "Most played album"}
                  </p>
                  <p className="mt-1 truncate text-xl font-bold text-white sm:text-2xl">
                    {hero.name}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-400">
                    {hero.count.toLocaleString()} plays this year
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Entity grids */}
          <div className="grid gap-6 sm:grid-cols-2">
            <EntityList title="Top Artists" items={topArtists} accentClass="text-emerald-500" />
            <EntityList title="Top Albums" items={topAlbums} accentClass="text-violet-400" />
            <EntityList title="Top Tracks" items={topTracks} accentClass="text-sky-400" />
            <EntityList title="Top Genres" items={topGenres} accentClass="text-amber-400" />
          </div>

          {/* Share CTA */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-5 py-4">
            <p className="text-sm text-zinc-400">
              Share your {year} — save it as a public report.
            </p>
            <Link
              href="/reports/listening"
              className="inline-flex items-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500"
            >
              Go to Rankings →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
