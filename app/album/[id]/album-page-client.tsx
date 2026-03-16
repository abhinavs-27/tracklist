"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { AlbumLogButton } from "@/app/album/[id]/album-log-button";
import { AlbumReviews } from "@/app/album/[id]/album-reviews";
import { AlbumReviewsProvider } from "@/app/album/[id]/album-reviews-context";
import { TrackCard } from "@/components/track-card";
import { useReviews } from "@/lib/hooks/use-reviews";
import type { FriendActivityItem } from "@/app/album/[id]/friends-who-listened";

function AlbumLazySectionSkeleton() {
  return (
    <section>
      <div className="mb-3 h-6 w-48 animate-pulse rounded bg-zinc-800/50" />
      <div className="min-h-[80px] animate-pulse rounded-xl bg-zinc-800/30" />
    </section>
  );
}

const FriendsWhoListened = dynamic(
  () => import("./friends-who-listened").then((m) => ({ default: m.FriendsWhoListened })),
  { loading: AlbumLazySectionSkeleton },
);
const AlbumRecommendationsSection = dynamic(
  () => import("./album-recommendations-section").then((m) => ({ default: m.AlbumRecommendationsSection })),
  { loading: AlbumLazySectionSkeleton },
);

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

/** Uses React Query so track stats update when user submits a song review on this page. */
function TrackStatsWithReviews({
  trackId,
  serverStats,
}: {
  trackId: string;
  serverStats: { listen_count: number; review_count: number; average_rating: number | null };
}) {
  const { data } = useReviews("song", trackId);
  const review_count = data?.count ?? serverStats.review_count;
  const average_rating = data?.average_rating ?? serverStats.average_rating;
  return (
    <TrackStatsLine
      listen_count={serverStats.listen_count}
      review_count={review_count}
      average_rating={average_rating}
    />
  );
}

export type AlbumPageClientProps = {
  id: string;
  album: SpotifyApi.AlbumObjectFull;
  tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
  session: boolean;
  stats: { listen_count: number; average_rating: number | null; review_count: number; rating_distribution?: Record<number, number> };
  engagementStats: { listen_count: number; review_count: number; avg_rating: number | null };
  friendActivity: FriendActivityItem[];
  trackStats: Record<string, { listen_count: number; review_count: number; average_rating: number | null }>;
  recommendedAlbums: SpotifyApi.AlbumObjectSimplified[];
};

export function AlbumPageClient({
  id,
  album,
  tracks,
  session,
  stats,
  engagementStats,
  friendActivity,
  trackStats,
  recommendedAlbums,
}: AlbumPageClientProps) {
  const image = album.images?.[0]?.url;

  return (
    <AlbumReviewsProvider albumId={id}>
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

            {stats.rating_distribution && stats.review_count > 0 && (
              <div className="mt-3 flex flex-col gap-1">
                <p className="text-xs text-zinc-500">Rating distribution</p>
                <div className="flex items-end gap-1" role="img" aria-label="Rating distribution">
                  {([1, 2, 3, 4, 5] as const).map((star) => {
                    const count = stats.rating_distribution![star];
                    const max = Math.max(...Object.values(stats.rating_distribution!));
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
            )}

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

        {friendActivity.length > 0 && <FriendsWhoListened activity={friendActivity} />}

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
                      <TrackStatsWithReviews
                        trackId={t.id}
                        serverStats={songStats}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {recommendedAlbums.length > 0 && (
          <AlbumRecommendationsSection albums={recommendedAlbums} albumName={album.name} />
        )}

        <AlbumReviews albumId={id} albumName={album.name} />
      </div>
    </AlbumReviewsProvider>
  );
}
