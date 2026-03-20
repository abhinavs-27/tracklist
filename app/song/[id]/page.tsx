import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getOrFetchTrack, getOrFetchTracksBatch } from "@/lib/spotify-cache";
import { AlbumLogButton } from "@/app/album/[id]/album-log-button";
import { EntityReviewsSection } from "@/components/entity-reviews-section";
import { SongStatsBar } from "@/app/song/[id]/song-stats-bar";
import { ListenCard } from "@/components/listen-card";
import { MediaGrid } from "@/components/media/MediaGrid";
import { getRelatedMedia } from "@/lib/discovery/getRelatedMedia";
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
    getRelatedMedia("song", id, 12),
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
  const relatedSongsRaw =
    songSettled[3].status === "fulfilled" ? songSettled[3].value : [];
  if (songSettled[3].status === "rejected")
    console.error("[song] getRelatedMedia failed:", songSettled[3].reason);

  const relatedTrackIds = relatedSongsRaw.map((r) => r.contentId);
  const relatedTracks =
    relatedTrackIds.length > 0
      ? (await getOrFetchTracksBatch(relatedTrackIds)).filter(
          (t): t is SpotifyApi.TrackObjectFull => t != null,
        )
      : [];

  const album = track.album;
  const image = album?.images?.[0]?.url;
  const duration = formatDuration(track.duration_ms);

  return (
    <div className="space-y-8">
      {/* Track header */}
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-end sm:gap-8">
        <div className="mx-auto h-44 w-44 shrink-0 overflow-hidden rounded-xl bg-zinc-800 sm:mx-0 sm:h-56 sm:w-56">
          {image ? (
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-5xl text-zinc-600 sm:text-6xl">
              ♪
            </div>
          )}
        </div>
        <div className="w-full min-w-0 flex-1 text-left">
          <h1 className="text-2xl font-bold text-white sm:text-3xl">{track.name}</h1>
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

          <SongStatsBar songId={id} serverStats={stats} />

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

      {/* Fans also like (co-occurrence) */}
      {relatedTracks.length > 0 && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-white sm:text-lg">
            Fans also like
          </h2>
          <p className="mb-3 text-sm text-zinc-400">
            Other songs listeners of this track also played
          </p>
          <MediaGrid
            items={relatedTracks.map((t) => ({
              id: t.id,
              type: "song",
              title: t.name,
              artist: t.artists?.map((a) => a.name).join(", ") ?? "",
              artworkUrl: t.album?.images?.[0]?.url ?? null,
            }))}
          />
        </section>
      )}

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
          <h2 className="mb-3 text-base font-semibold text-white sm:text-lg">
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
