import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { generateWeeklyReport } from "@/lib/queries";
import { getOrFetchAlbum, getOrFetchTrack } from "@/lib/spotify-cache";
import { getArtist } from "@/lib/spotify";

export default async function WeeklyReportPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/signin");

  const report = await generateWeeklyReport(session.user.id);
  if (!report) {
    return (
      <div className="space-y-6">
        <Link href="/" className="text-sm text-emerald-400 hover:underline">← Home</Link>
        <h1 className="text-2xl font-bold text-white">Weekly report</h1>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">No listening data in the last 7 days.</p>
          <Link href="/search" className="mt-3 inline-block text-emerald-400 hover:underline">Search for music</Link>
        </div>
      </div>
    );
  }

  let topArtistName: string | null = null;
  let topAlbum: { name: string; id: string } | null = null;
  let topTrack: { name: string; id: string } | null = null;

  if (report.top_artist_id) {
    try {
      const artist = await getArtist(report.top_artist_id);
      topArtistName = artist?.name ?? null;
    } catch {
      topArtistName = null;
    }
  }
  if (report.top_album_id) {
    try {
      const data = await getOrFetchAlbum(report.top_album_id);
      topAlbum = data?.album ? { name: data.album.name, id: data.album.id } : null;
    } catch {
      topAlbum = null;
    }
  }
  if (report.top_track_id) {
    try {
      const track = await getOrFetchTrack(report.top_track_id);
      topTrack = track ? { name: track.name, id: track.id } : null;
    } catch {
      topTrack = null;
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-emerald-400 hover:underline">← Home</Link>
      <h1 className="text-2xl font-bold text-white">Your week in music</h1>
      <p className="text-zinc-400">
        Last 7 days · week starting {new Date(report.week_start).toLocaleDateString()}
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Total listens</p>
          <p className="mt-1 text-2xl font-bold text-white">{report.listen_count}</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Top artist</p>
          <p className="mt-1 text-lg font-medium text-white">
            {topArtistName ? (
              <Link href={`/artist/${report.top_artist_id}`} className="hover:text-emerald-400 hover:underline">
                {topArtistName}
              </Link>
            ) : (
              <span className="text-zinc-500">—</span>
            )}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Top album</p>
          <p className="mt-1 text-lg font-medium text-white">
            {topAlbum ? (
              <Link href={`/album/${topAlbum.id}`} className="hover:text-emerald-400 hover:underline">
                {topAlbum.name}
              </Link>
            ) : (
              <span className="text-zinc-500">—</span>
            )}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Top track</p>
          <p className="mt-1 text-lg font-medium text-white">
            {topTrack ? (
              <Link href={`/song/${topTrack.id}`} className="hover:text-emerald-400 hover:underline">
                {topTrack.name}
              </Link>
            ) : (
              <span className="text-zinc-500">—</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
