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
  getAlbumEngagementStats,
  getFriendsAlbumActivity,
  getTrackStatsForTrackIds,
  getListenLogsForAlbum,
  getAlbumRecommendations,
} from "@/lib/queries";
import { formatRelativeTime } from "@/lib/time";
import { getOrFetchAlbumsBatch } from "@/lib/spotify-cache";
import { AlbumCard } from "@/components/album-card";

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
  const viewerId = session?.user?.id ?? null;
  const [reviewsData, stats, engagementStats, friendActivity, trackStats, recentListens, recommendationsRaw] = await Promise.all([
    getReviewsForEntity("album", id, 20),
    getEntityStats("album", id),
    getAlbumEngagementStats(id),
    viewerId ? getFriendsAlbumActivity(viewerId, id, 10) : Promise.resolve([]),
    getTrackStatsForTrackIds(trackIds),
    getListenLogsForAlbum(id, 15),
    getAlbumRecommendations(id, 10),
  ]);

  const recommendationAlbumIds = recommendationsRaw.map((r) => r.album_id);
  const recommendationAlbumResults =
    recommendationAlbumIds.length > 0
      ? await getOrFetchAlbumsBatch(recommendationAlbumIds)
      : [];
  const recommendedAlbums = recommendationAlbumResults.filter(
    (a): a is SpotifyApi.AlbumObjectSimplified => a != null,
  );

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

          {/* Engagement stats under album title */}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
            {engagementStats.avg_rating != null && (
              <span className="text-amber-400">
                ★ {engagementStats.avg_rating.toFixed(1)} average rating
              </span>
            )}
            {engagementStats.listen_count > 0 && (
              <span className="text-zinc-400">
                {engagementStats.listen_count.toLocaleString()} listen{engagementStats.listen_count !== 1 ? "s" : ""}
              </span>
            )}
            {engagementStats.review_count > 0 && (
              <span className="text-zinc-400">
                {engagementStats.review_count} review{engagementStats.review_count !== 1 ? "s" : ""}
              </span>
            )}
            {engagementStats.listen_count === 0 && engagementStats.review_count === 0 && (
              <span className="text-zinc-500">No listens or reviews yet</span>
            )}
          </div>

          {/* Rating distribution */}
          {stats.rating_distribution && stats.review_count > 0 && (() => {
            const dist = stats.rating_distribution!;
            return (
            <div className="mt-3 flex flex-col gap-1">
              <p className="text-xs text-zinc-500">Rating distribution</p>
              <div className="flex items-end gap-1" role="img" aria-label="Rating distribution">
                {([1, 2, 3, 4, 5] as const).map((star) => {
                  const count = dist[star];
                  const max = Math.max(...Object.values(dist));
                  const height = max > 0 ? (count / max) * 32 : 0;
                  return (
                    <div key={star} className="flex flex-1 flex-col items-center gap-0.5">
                      <div
                        className="w-full rounded-t bg-amber-500/40"
                        style={{ height: `${Math.max(height, 2)}px`, minHeight: "2px" }}
                        title={`${star} star: ${count}`}
                      />
                      <span className="text-[10px] text-zinc-500">{star}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            );
          })()}

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

      {/* Recommended Albums — "Because you listened to X" */}
      {recommendedAlbums.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Recommended Albums</h2>
          <p className="mb-3 text-sm text-zinc-400">Because you listened to {album.name}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {recommendedAlbums.map((rec) => (
              <AlbumCard key={rec.id} album={rec} />
            ))}
          </div>
        </section>
      )}

      {/* Recent listens */}
      {recentListens.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Recent listens</h2>
          <ul className="space-y-2">
            {recentListens.slice(0, 15).map((log) => (
              <li
                key={log.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  {log.user?.avatar_url ? (
                    <img
                      src={log.user.avatar_url}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs text-zinc-300">
                      {log.user?.username?.[0]?.toUpperCase() ?? "?"}
                    </span>
                  )}
                  <Link
                    href={log.user?.username ? `/profile/${log.user.username}` : "#"}
                    className="truncate text-sm font-medium text-white hover:text-emerald-400 hover:underline"
                  >
                    {log.user?.username ?? "Unknown"}
                  </Link>
                </div>
                <span className="shrink-0 text-xs text-zinc-500">
                  {formatRelativeTime(log.listened_at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Reviews */}
      <EntityReviewsSection
        entityType="album"
        entityId={id}
        spotifyName={album.name}
        initialData={reviewsData}
      />

      {/* Friends who listened (only shown when logged in; list is friends-only) */}
      {friendActivity.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Friends who listened
          </h2>
          <ul className="space-y-2">
            {friendActivity.map((l, i) => (
              <li key={`${l.user_id}-${l.listened_at}-${i}`}>
                <Link
                  href={`/profile/${l.username}`}
                  className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm transition hover:border-zinc-600"
                >
                  {l.avatar_url ? (
                    <img
                      src={l.avatar_url}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-300">
                      {l.username[0]?.toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-zinc-200">{l.username}</span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {formatRelativeTime(l.listened_at)}
                  </span>
                  {l.rating != null && (
                    <span className="shrink-0 text-amber-400">★ {l.rating}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
