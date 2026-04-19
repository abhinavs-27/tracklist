import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPeriodReport } from "@/lib/queries";
import { getWeeklyListeningStory } from "@/lib/reports/weekly-listening-story";
import { getOrFetchAlbum, getOrFetchTrack } from "@/lib/spotify-cache";
import { getArtist } from "@/lib/spotify";
import type { WeeklyListeningStoryPayload } from "@/types";

type PeriodType = "week" | "month" | "year";

function parsePeriod(s: string | null): PeriodType {
  if (s === "month" || s === "year") return s;
  return "week";
}

function parseOffset(s: string | null): number {
  const n = parseInt(s ?? "0", 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function comparisonLine(logsDiffPercent: number | null): string {
  if (logsDiffPercent == null) {
    return "No prior week to compare — keep logging.";
  }
  const r = Math.round(logsDiffPercent);
  if (r === 0) return "About the same listening volume as last week.";
  if (r > 0) return `${r}% more listening than last week.`;
  return `${Math.abs(r)}% less listening than last week.`;
}

export default async function WeeklyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; offset?: string }>;
}) {
  const session = await getSession();
  if (!session?.user?.id) redirect("/auth/signin");

  const params = await searchParams;
  const period = parsePeriod(params.period ?? null);
  const offset = parseOffset(params.offset ?? null);
  const userId = session.user.id;

  if (period === "week") {
    const story = await getWeeklyListeningStory(userId, offset);
    if (!story) {
      return (
        <div className="space-y-6">
          <Link href="/" className="text-sm text-emerald-400 hover:underline">
            ← Home
          </Link>
          <h1 className="text-2xl font-bold text-white">Listening report</h1>
          <p className="text-zinc-400">Could not load this week's report.</p>
        </div>
      );
    }
    return (
      <WeeklyStoryPage
        story={story}
        offset={offset}
        basePath="/reports/week"
      />
    );
  }

  const report = await getPeriodReport(userId, period, offset);
  if (!report) {
    return (
      <div className="space-y-6">
        <Link href="/" className="text-sm text-emerald-400 hover:underline">
          ← Home
        </Link>
        <h1 className="text-2xl font-bold text-white">Listening report</h1>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">No listening data for this period.</p>
          <Link
            href="/search"
            className="mt-3 inline-block text-emerald-400 hover:underline"
          >
            Search for music
          </Link>
        </div>
      </div>
    );
  }

  let topArtist: {
    name: string;
    id: string;
    imageUrl: string | null;
  } | null = null;
  let topAlbum: {
    name: string;
    id: string;
    imageUrl: string | null;
  } | null = null;
  let topTrack: {
    name: string;
    id: string;
    imageUrl: string | null;
  } | null = null;

  if (report.top_artist_id) {
    try {
      const artist = await getArtist(report.top_artist_id);
      topArtist = artist
        ? {
            name: artist.name,
            id: artist.id,
            imageUrl: artist.images?.[0]?.url ?? null,
          }
        : null;
    } catch {
      topArtist = null;
    }
  }
  if (report.top_album_id) {
    try {
      const data = await getOrFetchAlbum(report.top_album_id, {
        allowNetwork: true,
      });
      topAlbum = data?.album
        ? {
            name: data.album.name,
            id: data.album.id,
            imageUrl: data.album.images?.[0]?.url ?? null,
          }
        : null;
    } catch {
      topAlbum = null;
    }
  }
  if (report.top_track_id) {
    try {
      const { track } = await getOrFetchTrack(report.top_track_id, {
        allowNetwork: true,
      });
      topTrack = track
        ? {
            name: track.name,
            id: track.id,
            imageUrl: track.album?.images?.[0]?.url ?? null,
          }
        : null;
    } catch {
      topTrack = null;
    }
  }

  const base = "/reports/week";
  const prevUrl = `${base}?period=${period}&offset=${offset + 1}`;
  const nextUrl = offset > 0 ? `${base}?period=${period}&offset=${offset - 1}` : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <Link href="/" className="text-sm text-emerald-400 hover:underline">
          ← Home
        </Link>
        <Link
          href="/reports/listening"
          className="text-sm text-zinc-500 hover:text-emerald-400 hover:underline"
        >
          Full rankings →
        </Link>
      </div>
      <h1 className="text-2xl font-bold text-white">Listening report</h1>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-500">Period:</span>
        <Link
          href={`${base}?period=week&offset=0`}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700"
        >
          Week
        </Link>
        <Link
          href={`${base}?period=month&offset=0`}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${period === "month" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
        >
          Month
        </Link>
        <Link
          href={`${base}?period=year&offset=0`}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${period === "year" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
        >
          Year
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-zinc-400">{report.period_label}</p>
        <nav className="flex gap-2" aria-label="Previous or next period">
          <Link
            href={prevUrl}
            className="rounded-lg border border-zinc-600 bg-zinc-800/50 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
          >
            ← Previous
          </Link>
          {nextUrl && (
            <Link
              href={nextUrl}
              className="rounded-lg border border-zinc-600 bg-zinc-800/50 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
            >
              Next →
            </Link>
          )}
        </nav>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Total listens
          </p>
          <p className="mt-1 text-2xl font-bold text-white">{report.listen_count}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Top artist
          </p>
          <div className="mt-2 flex items-center gap-3">
            {topArtist ? (
              <>
                <Link
                  href={`/artist/${topArtist.id}`}
                  className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-800"
                >
                  {topArtist.imageUrl ? (
                    <img
                      src={topArtist.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg text-zinc-500">
                      ♪
                    </div>
                  )}
                </Link>
                <Link
                  href={`/artist/${topArtist.id}`}
                  className="text-lg font-medium text-white hover:text-emerald-400 hover:underline"
                >
                  {topArtist.name}
                </Link>
              </>
            ) : (
              <span className="text-zinc-500">—</span>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Top album
          </p>
          <div className="mt-2 flex items-center gap-3">
            {topAlbum ? (
              <>
                <Link
                  href={`/album/${topAlbum.id}`}
                  className="h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-800"
                >
                  {topAlbum.imageUrl ? (
                    <img
                      src={topAlbum.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg text-zinc-500">
                      ♪
                    </div>
                  )}
                </Link>
                <Link
                  href={`/album/${topAlbum.id}`}
                  className="text-lg font-medium text-white hover:text-emerald-400 hover:underline"
                >
                  {topAlbum.name}
                </Link>
              </>
            ) : (
              <span className="text-zinc-500">—</span>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Top track
          </p>
          <div className="mt-2 flex items-center gap-3">
            {topTrack ? (
              <>
                <Link
                  href={`/song/${topTrack.id}`}
                  className="h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-800"
                >
                  {topTrack.imageUrl ? (
                    <img
                      src={topTrack.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg text-zinc-500">
                      ♪
                    </div>
                  )}
                </Link>
                <Link
                  href={`/song/${topTrack.id}`}
                  className="text-lg font-medium text-white hover:text-emerald-400 hover:underline"
                >
                  {topTrack.name}
                </Link>
              </>
            ) : (
              <span className="text-zinc-500">—</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WeeklyStoryPage({
  story,
  offset,
  basePath,
}: {
  story: WeeklyListeningStoryPayload;
  offset: number;
  basePath: string;
}) {
  const prevUrl = `${basePath}?period=week&offset=${offset + 1}`;
  const nextUrl = offset > 0 ? `${basePath}?period=week&offset=${offset - 1}` : null;
  const { stats, top, insights, summary, comparison, periodLabel } = story;

  return (
    <div className="space-y-8">
      <Link href="/" className="text-sm text-emerald-400 hover:underline">
        ← Home
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-500">Period:</span>
        <Link
          href={`${basePath}?period=week&offset=0`}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          Week
        </Link>
        <Link
          href={`${basePath}?period=month&offset=0`}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700"
        >
          Month
        </Link>
        <Link
          href={`${basePath}?period=year&offset=0`}
          className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700"
        >
          Year
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-zinc-500">{periodLabel}</p>
        <nav className="flex gap-2" aria-label="Previous or next week">
          <Link
            href={prevUrl}
            className="rounded-lg border border-zinc-600 bg-zinc-800/50 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
          >
            ← Previous week
          </Link>
          {nextUrl && (
            <Link
              href={nextUrl}
              className="rounded-lg border border-zinc-600 bg-zinc-800/50 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
            >
              Next week →
            </Link>
          )}
        </nav>
      </div>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Your week in music
        </h1>
        <p className="text-xl font-medium leading-snug text-white sm:text-2xl">
          {summary}
        </p>
        <p className="text-sm text-zinc-500">
          Based on your listens from the past seven days (week starting Monday).
        </p>
      </header>

      <section aria-label="Weekly stats">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total listens" value={stats.totalLogs} />
          <StatCard label="Unique artists" value={stats.uniqueArtists} />
          <StatCard label="New artists" value={stats.newArtists} />
          <StatCard label="Best day streak" value={stats.streakDays} />
        </div>
      </section>

      <section aria-label="Top artist, album, and track">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Top picks
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <TopCard
            label="Artist"
            entity={top.artist}
            hrefPrefix="/artist"
          />
          <TopCard label="Album" entity={top.album} hrefPrefix="/album" />
          <TopCard label="Track" entity={top.track} hrefPrefix="/song" />
        </div>
      </section>

      {insights.length > 0 ? (
        <section aria-label="Insights">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Insights
          </h2>
          <ul className="space-y-2">
            {insights.map((line) => (
              <li
                key={line}
                className="flex gap-2 text-sm leading-relaxed text-zinc-300"
              >
                <span className="text-emerald-500/90">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        className="rounded-lg border border-zinc-800/80 bg-zinc-900/40 px-4 py-3"
        aria-label="Week over week"
      >
        <p className="text-sm text-zinc-300">
          <span className="font-medium text-zinc-200">Vs last week: </span>
          {comparisonLine(comparison.logsDiffPercent)}
        </p>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
        {value}
      </p>
    </div>
  );
}

function TopCard({
  label,
  entity,
  hrefPrefix,
}: {
  label: string;
  entity: { id: string; name: string | null; imageUrl: string | null } | null;
  hrefPrefix: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </p>
      <div className="mt-3 flex items-center gap-3">
        {entity?.id ? (
          <>
            <Link
              href={`${hrefPrefix}/${entity.id}`}
              className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-800 sm:h-16 sm:w-16"
            >
              {entity.imageUrl ? (
                <img
                  src={entity.imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-lg text-zinc-500">
                  ♪
                </div>
              )}
            </Link>
            <Link
              href={`${hrefPrefix}/${entity.id}`}
              className="min-w-0 text-base font-medium text-white hover:text-emerald-400 hover:underline"
            >
              {entity.name ?? "—"}
            </Link>
          </>
        ) : (
          <span className="text-zinc-500">—</span>
        )}
      </div>
    </div>
  );
}
