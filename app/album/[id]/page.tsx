import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getOrFetchAlbum } from "@/lib/spotify-cache";
import { AlbumLogButton } from "@/app/album/[id]/album-log-button";
import { TrackCard } from "@/components/track-card";
import { EntityReviewsSection } from "@/components/entity-reviews-section";
import {
  getReviewsForEntity,
  getEntityStats,
  getAlbumListeners,
  getTrackStatsForTrackIds,
} from "@/lib/queries";

type PageParams = Promise<{ id: string }>;

function formatDuration(ms: number | undefined) {
  if (!ms) return null;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function TrackStatsLine({
  listen_count,
  review_count,
  average_rating,
}: {
  listen_count: number;
  review_count: number;
  average_rating: number | null;
}) {
  const hasAny = listen_count > 0 || review_count > 0;
  if (!hasAny) {
    return (
      <span className="text-xs text-zinc-600">No listens or reviews yet</span>
    );
  }
  const parts: string[] = [];
  if (listen_count > 0) parts.push(`${listen_count} listen${listen_count !== 1 ? "s" : ""}`);
  if (review_count > 0) parts.push(`${review_count} review${review_count !== 1 ? "s" : ""}`);
  if (average_rating != null) parts.push(`${average_rating.toFixed(1)}★`);
  return (
    <span className="text-xs text-zinc-500">
      {parts.join(" · ")}
    </span>
  );
}

export default async function AlbumPage({ params }: { params: PageParams }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  let album: SpotifyApi.AlbumObjectFull;
  let tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
  try {
    const data = await getOrFetchAlbum(id);
    album = data.album;
    tracks = data.tracks;
  } catch {
    notFound();
  }

  const trackIds = tracks.items?.map((t) => t.id) ?? [];
  const [reviewsData, stats, listeners, trackStats] = await Promise.all([
    getReviewsForEntity("album", id),
    getEntityStats("album", id),
    getAlbumListeners(id, 8),
    getTrackStatsForTrackIds(trackIds),
  ]);

  const image = album.images?.[0]?.url;

  return (
    <div className="space-y-8">
      {/* Album header */}
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
          <h1 className="text-3xl font-bold text-white">{album.name}</h1>
          <p className="mt-1 text-zinc-400">
            {album.artists?.map((a, i) => (
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
          {album.release_date && (
            <p className="mt-1 text-sm text-zinc-500">
              {new Date(album.release_date).getFullYear()}
            </p>
          )}

          {/* Stats bar */}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            {stats.listen_count > 0 && (
              <span className="text-zinc-400">
                {stats.listen_count.toLocaleString()} listen{stats.listen_count !== 1 ? "s" : ""}
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
                type="album"
                spotifyName={album.name}
              />
            </div>
          )}
        </div>
      </div>

      {/* Tracklist */}
      {tracks.items?.length ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Tracks</h2>
          <div className="space-y-1">
            {tracks.items.map((t, i) => {
              const songStats = trackStats[t.id] ?? { listen_count: 0, review_count: 0, average_rating: null };
              return (
                <div key={t.id} className="flex flex-col gap-0.5 py-1.5">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-right text-xs text-zinc-600">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <TrackCard track={t} showAlbum={false} songPageLink showThumbnail={false} />
                    </div>
                    <span className="hidden text-xs text-zinc-600 sm:block">
                      {formatDuration(t.duration_ms)}
                    </span>
                    {session && (
                      <AlbumLogButton
                        spotifyId={t.id}
                        type="song"
                        spotifyName={t.name}
                        className="shrink-0"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-3 pl-9">
                    <TrackStatsLine
                      listen_count={songStats.listen_count}
                      review_count={songStats.review_count}
                      average_rating={songStats.average_rating}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Reviews */}
      <EntityReviewsSection
        entityType="album"
        entityId={id}
        spotifyName={album.name}
        initialData={reviewsData}
      />

      {/* Friends who listened */}
      {listeners.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Who listened
          </h2>
          <div className="flex flex-wrap gap-3">
            {listeners.map((l) => (
              <Link
                key={l.user_id}
                href={`/profile/${l.username}`}
                className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-sm transition hover:border-zinc-600"
              >
                {l.avatar_url ? (
                  <img
                    src={l.avatar_url}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[10px] text-zinc-300">
                    {l.username[0]?.toUpperCase()}
                  </span>
                )}
                <span className="text-zinc-200">{l.username}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
