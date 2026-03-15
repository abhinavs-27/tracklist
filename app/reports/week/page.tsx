import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getPeriodReport } from "@/lib/queries";
import { getOrFetchAlbum, getOrFetchTrack } from "@/lib/spotify-cache";
import { getArtist } from "@/lib/spotify";

type PeriodType = "week" | "month" | "year";

function parsePeriod(s: string | null): PeriodType {
  if (s === "month" || s === "year") return s;
  return "week";
}

function parseOffset(s: string | null): number {
  const n = parseInt(s ?? "0", 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default async function WeeklyReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; offset?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const params = await searchParams;
  const period = parsePeriod(params.period ?? null);
  const offset = parseOffset(params.offset ?? null);

  const report = await getPeriodReport(session.user.id, period, offset);
  if (!report) {
    return (
      <div className="space-y-6">
        <Link href="/" className="text-sm text-emerald-400 hover:underline">← Home</Link>
        <h1 className="text-2xl font-bold text-white">Listening report</h1>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">No listening data for this period.</p>
          <Link href="/search" className="mt-3 inline-block text-emerald-400 hover:underline">Search for music</Link>
        </div>
      </div>
    );
  }

  let topArtist: { name: string; id: string; imageUrl: string | null } | null = null;
  let topAlbum: { name: string; id: string; imageUrl: string | null } | null = null;
  let topTrack: { name: string; id: string; imageUrl: string | null } | null = null;

  if (report.top_artist_id) {
    try {
      const artist = await getArtist(report.top_artist_id);
      topArtist = artist ? { name: artist.name, id: artist.id, imageUrl: artist.images?.[0]?.url ?? null } : null;
    } catch {
      topArtist = null;
    }
  }
  if (report.top_album_id) {
    try {
      const data = await getOrFetchAlbum(report.top_album_id);
      topAlbum = data?.album ? { name: data.album.name, id: data.album.id, imageUrl: data.album.images?.[0]?.url ?? null } : null;
    } catch {
      topAlbum = null;
    }
  }
  if (report.top_track_id) {
    try {
      const track = await getOrFetchTrack(report.top_track_id);
      topTrack = track ? { name: track.name, id: track.id, imageUrl: track.album?.images?.[0]?.url ?? null } : null;
    } catch {
      topTrack = null;
    }
  }

  const base = "/reports/week";
  const prevUrl = `${base}?period=${period}&offset=${offset + 1}`;
  const nextUrl = offset > 0 ? `${base}?period=${period}&offset=${offset - 1}` : null;

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-emerald-400 hover:underline">← Home</Link>
      <h1 className="text-2xl font-bold text-white">Listening report</h1>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-500">Period:</span>
        <Link
          href={`${base}?period=week&offset=0`}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${period === "week" ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
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
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total listens</p>
          <p className="mt-1 text-2xl font-bold text-white">{report.listen_count}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Top artist</p>
          <div className="mt-2 flex items-center gap-3">
            {topArtist ? (
              <>
                <Link href={`/artist/${topArtist.id}`} className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-zinc-800">
                  {topArtist.imageUrl ? (
                    <img src={topArtist.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg text-zinc-500">♪</div>
                  )}
                </Link>
                <Link href={`/artist/${topArtist.id}`} className="text-lg font-medium text-white hover:text-emerald-400 hover:underline">
                  {topArtist.name}
                </Link>
              </>
            ) : (
              <span className="text-zinc-500">—</span>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Top album</p>
          <div className="mt-2 flex items-center gap-3">
            {topAlbum ? (
              <>
                <Link href={`/album/${topAlbum.id}`} className="h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-800">
                  {topAlbum.imageUrl ? (
                    <img src={topAlbum.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg text-zinc-500">♪</div>
                  )}
                </Link>
                <Link href={`/album/${topAlbum.id}`} className="text-lg font-medium text-white hover:text-emerald-400 hover:underline">
                  {topAlbum.name}
                </Link>
              </>
            ) : (
              <span className="text-zinc-500">—</span>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Top track</p>
          <div className="mt-2 flex items-center gap-3">
            {topTrack ? (
              <>
                <Link href={`/song/${topTrack.id}`} className="h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-800">
                  {topTrack.imageUrl ? (
                    <img src={topTrack.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg text-zinc-500">♪</div>
                  )}
                </Link>
                <Link href={`/song/${topTrack.id}`} className="text-lg font-medium text-white hover:text-emerald-400 hover:underline">
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
