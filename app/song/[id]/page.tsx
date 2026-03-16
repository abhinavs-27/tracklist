import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getOrFetchTrack } from "@/lib/spotify-cache";
import { AlbumLogButton } from "@/app/album/[id]/album-log-button";
import { EntityReviewsSection } from "@/components/entity-reviews-section";
import { ListenCard } from "@/components/listen-card";
import {
  getReviewsForEntity,
  getEntityStats,
  getListenLogsForTrack,
} from "@/lib/queries";

type PageParams = Promise<{ id: string }>;

function formatDuration(ms: number | undefined) {
  if (!ms) return null;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default async function SongPage({ params }: { params: PageParams }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  let track: SpotifyApi.TrackObjectFull;
  try {
    track = await getOrFetchTrack(id);
  } catch {
    notFound();
  }

  const songSettled = await Promise.allSettled([
    getReviewsForEntity("song", id),
    getEntityStats("song", id),
    getListenLogsForTrack(id, 10),
  ]);

  const defaultStats = {
    listen_count: 0,
    average_rating: null as number | null,
    review_count: 0,
  };
  const reviewsData =
    songSettled[0].status === "fulfilled"
      ? songSettled[0].value
      : { reviews: [], average_rating: null, count: 0, my_review: null };
  if (songSettled[0].status === "rejected")
    console.error("[song] getReviewsForEntity failed:", songSettled[0].reason);
  const stats =
    songSettled[1].status === "fulfilled" ? songSettled[1].value : defaultStats;
  if (songSettled[1].status === "rejected")
    console.error("[song] getEntityStats failed:", songSettled[1].reason);
  const recentListens =
    songSettled[2].status === "fulfilled" ? songSettled[2].value : [];
  if (songSettled[2].status === "rejected")
    console.error(
      "[song] getListenLogsForTrack failed:",
      songSettled[2].reason,
    );

  const album = track.album;
  const image = album?.images?.[0]?.url;
  const duration = formatDuration(track.duration_ms);

  return (
    <div className="space-y-8">
      {/* Track header */}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
        <div className="h-48 w-48 shrink-0 overflow-hidden rounded-xl bg-zinc-800 sm:h-56 sm:w-56">
          {image ? (
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-6xl text-zinc-600">
              ♪
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold text-white">{track.name}</h1>
          <p className="mt-1 text-zinc-400">
            {track.artists?.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ", "}
                <Link
                  href={`/artist/${a.id}`}
                  className="hover:text-emerald-400 hover:underline"
                >
                  {a.name}
                </Link>
              </span>
            ))}
          </p>
          {album && (
            <p className="mt-1 text-sm text-zinc-500">
              <Link
                href={`/album/${album.id}`}
                className="hover:text-emerald-400 hover:underline"
              >
                {album.name}
              </Link>
            </p>
          )}
          {duration && <p className="mt-1 text-xs text-zinc-600">{duration}</p>}

          {/* Stats bar */}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            {stats.listen_count > 0 && (
              <span className="text-zinc-400">
                {stats.listen_count.toLocaleString()} listen
                {stats.listen_count !== 1 ? "s" : ""}
              </span>
            )}
            {stats.average_rating != null && (
              <span className="text-amber-400">
                ★ {stats.average_rating.toFixed(1)}
              </span>
            )}
            {stats.review_count > 0 && (
              <span className="text-zinc-400">
                {stats.review_count} review{stats.review_count !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {session && (
            <div className="mt-4">
              <AlbumLogButton
                spotifyId={id}
                type="song"
                spotifyName={track.name}
              />
            </div>
          )}
        </div>
      </div>

      {/* Reviews */}
      <EntityReviewsSection
        entityType="song"
        entityId={id}
        spotifyName={track.name}
        initialData={reviewsData}
      />

      {/* Recent listens */}
      {recentListens.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Recent listens
          </h2>
          <ul className="space-y-2">
            {recentListens.map((log) => (
              <li key={log.id}>
                <ListenCard log={log} trackName={track.name} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
