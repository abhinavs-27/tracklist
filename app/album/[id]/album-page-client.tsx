"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { LogListenButton } from "@/components/logging/log-listen-button";
import { RecordRecentView } from "@/components/logging/record-recent-view";
import { AlbumLogButton } from "@/app/album/[id]/album-log-button";
import { TrackCard } from "@/components/track-card";
import { useReviews } from "@/lib/hooks/use-reviews";
import type { FriendActivityItem } from "@/app/album/[id]/friends-who-listened";
import { pageTitle, sectionGap, sectionTitle } from "@/lib/ui/surface";

function AlbumLazySectionSkeleton() {
  return (
    <section>
      <div className="mb-4 h-7 w-56 animate-pulse rounded-lg bg-zinc-800/60" />
      <div className="min-h-[88px] animate-pulse rounded-2xl bg-zinc-900/50 ring-1 ring-inset ring-white/[0.06]" />
    </section>
  );
}

const FriendsWhoListened = dynamic(
  () => import("./friends-who-listened").then((m) => ({ default: m.FriendsWhoListened })),
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

type TrackStatRow = {
  listen_count: number;
  review_count: number;
  average_rating: number | null;
};

export type AlbumPageClientProps = {
  id: string;
  album: SpotifyApi.AlbumObjectFull;
  tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
  session: boolean;
  stats: { listen_count: number; average_rating: number | null; review_count: number; rating_distribution?: Record<number, number> };
  engagementStats: { listen_count: number; review_count: number; avg_rating: number | null };
  friendActivity: FriendActivityItem[];
};

export function AlbumPageClient({
  id,
  album,
  tracks,
  session,
  stats,
  engagementStats,
  friendActivity,
}: AlbumPageClientProps) {
  const image = album.images?.[0]?.url;
  const firstTrack = tracks.items?.[0];

  const [trackStats, setTrackStats] = useState<Record<string, TrackStatRow>>({});
  const [trackStatsLoading, setTrackStatsLoading] = useState(true);

  const trackIdsKey = useMemo(
    () => tracks.items?.map((t) => t.id).join(",") ?? "",
    [tracks.items],
  );

  useEffect(() => {
    const ids = tracks.items?.map((t) => t.id) ?? [];
    if (ids.length === 0) {
      setTrackStatsLoading(false);
      return;
    }
    let cancelled = false;
    const chunkSize = 400;
    void (async () => {
      try {
        const merged: Record<string, TrackStatRow> = {};
        for (let i = 0; i < ids.length; i += chunkSize) {
          const chunk = ids.slice(i, i + chunkSize);
          const res = await fetch("/api/track-stats/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ track_ids: chunk }),
          });
          if (!res.ok) throw new Error(String(res.status));
          const payload = (await res.json()) as {
            stats?: Record<string, TrackStatRow>;
          };
          Object.assign(merged, payload.stats ?? {});
        }
        if (!cancelled) setTrackStats(merged);
      } catch {
        if (!cancelled) setTrackStats({});
      } finally {
        if (!cancelled) setTrackStatsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trackIdsKey]);

  const emptyTrackStat: TrackStatRow = {
    listen_count: 0,
    review_count: 0,
    average_rating: null,
  };

  return (
      <div className={sectionGap}>
        {session && firstTrack ? (
          <RecordRecentView
            kind="album"
            id={id}
            title={album.name}
            subtitle={
              album.artists?.map((a) => a.name).join(", ") ?? ""
            }
            artworkUrl={image ?? null}
            trackId={firstTrack.id}
            albumId={id}
            artistId={album.artists?.[0]?.id ?? null}
          />
        ) : null}
        {/* Album header */}
        <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-end sm:gap-10">
          <div className="mx-auto h-44 w-44 shrink-0 overflow-hidden rounded-2xl bg-zinc-800 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.65)] ring-1 ring-inset ring-white/[0.08] sm:mx-0 sm:h-56 sm:w-56">
            {image ? (
              <img src={image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-5xl text-zinc-600 sm:text-6xl">
                ♪
              </div>
            )}
          </div>
          <div className="w-full min-w-0 flex-1 text-left">
            <h1 className={pageTitle}>{album.name}</h1>
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
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {firstTrack ? (
                  <LogListenButton
                    trackId={firstTrack.id}
                    albumId={id}
                    artistId={album.artists?.[0]?.id ?? null}
                    displayName={album.name}
                  />
                ) : null}
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
            <h2 className={`mb-5 ${sectionTitle}`}>Tracks</h2>
            <div className="space-y-1">
              {tracks.items.map((t, i) => {
                const songStats = trackStats[t.id] ?? emptyTrackStat;
                return (
                  <div
                    key={t.id}
                    className="flex flex-col gap-1 rounded-lg py-1.5 transition-colors hover:bg-zinc-900/40 sm:py-2"
                  >
                    <div className="flex min-h-[48px] items-center gap-2 sm:gap-3">
                      <span className="w-6 shrink-0 text-right text-xs text-zinc-600 tabular-nums">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <TrackCard track={t} showAlbum={false} songPageLink showThumbnail={false} />
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-zinc-600">
                        {formatDuration(t.duration_ms) ?? "—"}
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
                    <div className="flex min-h-[1.25rem] items-center gap-3 pl-8 sm:pl-9">
                      {trackStatsLoading ? (
                        <span className="inline-block h-3 w-28 animate-pulse rounded bg-zinc-800/60" />
                      ) : (
                        <TrackStatsWithReviews
                          trackId={t.id}
                          serverStats={songStats}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
  );
}
