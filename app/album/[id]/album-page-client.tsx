"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { LogListenButton } from "@/components/logging/log-listen-button";
import { RecordRecentView } from "@/components/logging/record-recent-view";
import { AlbumLogButton } from "@/app/album/[id]/album-log-button";
import type { FriendActivityItem } from "@/app/album/[id]/friends-who-listened";
import { AlbumFavoritedByModal } from "@/components/album-favorited-by-modal";
import { HALF_STAR_RATINGS } from "@/lib/ratings";
import { pageTitle, sectionGap } from "@/lib/ui/surface";

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

export type AlbumPageClientProps = {
  id: string;
  album: SpotifyApi.AlbumObjectFull;
  tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
  session: boolean;
  viewerUserId: string | null;
  stats: {
    listen_count: number;
    average_rating: number | null;
    review_count: number;
    rating_distribution?: Record<string, number>;
  };
  engagementStats: {
    listen_count: number;
    review_count: number;
    avg_rating: number | null;
    favorite_count: number;
  };
  friendActivity: FriendActivityItem[];
};

export function AlbumPageClient({
  id,
  album,
  tracks,
  session,
  viewerUserId,
  stats,
  engagementStats,
  friendActivity,
}: AlbumPageClientProps) {
  const image = album.images?.[0]?.url;
  const firstTrack = tracks.items?.[0];
  const [favoritedByOpen, setFavoritedByOpen] = useState(false);

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

            <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-zinc-400">
              {engagementStats.avg_rating != null && (
                <span className="text-amber-400">
                  ★ {engagementStats.avg_rating.toFixed(1)} average rating
                </span>
              )}
              {engagementStats.listen_count > 0 && (
                <span>
                  {engagementStats.listen_count.toLocaleString()} listen{engagementStats.listen_count !== 1 ? "s" : ""}
                </span>
              )}
              {engagementStats.review_count > 0 && (
                <span>
                  {engagementStats.review_count} review{engagementStats.review_count !== 1 ? "s" : ""}
                </span>
              )}
              {engagementStats.favorite_count > 0 && (
                <button
                  type="button"
                  onClick={() => setFavoritedByOpen(true)}
                  className="m-0 inline cursor-pointer border-0 bg-transparent p-0 font-normal text-inherit underline-offset-2 transition hover:text-zinc-300 hover:underline"
                >
                  {engagementStats.favorite_count.toLocaleString()} favorited
                </button>
              )}
              {engagementStats.listen_count === 0 &&
                engagementStats.review_count === 0 &&
                engagementStats.favorite_count === 0 && (
                <span className="text-zinc-500">No listens or reviews yet</span>
              )}
            </div>

            {stats.rating_distribution && stats.review_count > 0 && (
              <div className="mt-3 flex flex-col gap-1">
                <p className="text-xs text-zinc-500">Rating distribution</p>
                <div
                  className="flex items-end gap-0.5 overflow-x-auto pb-1"
                  role="img"
                  aria-label="Rating distribution"
                >
                  {HALF_STAR_RATINGS.map((star) => {
                    const key = String(star);
                    const count = stats.rating_distribution![key] ?? 0;
                    const max = Math.max(...Object.values(stats.rating_distribution!));
                    const height = max > 0 ? (count / max) * 32 : 0;
                    return (
                      <div
                        key={key}
                        className="flex min-w-[1.25rem] flex-1 flex-col items-center gap-0.5"
                      >
                        <div
                          className="w-full rounded-t bg-amber-500/40"
                          style={{
                            height: `${Math.max(height, 2)}px`,
                            minHeight: "2px",
                          }}
                          title={`${key} stars: ${count}`}
                        />
                        <span className="whitespace-nowrap text-[8px] leading-none text-zinc-500 sm:text-[9px]">
                          {key}
                        </span>
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

        <AlbumFavoritedByModal
          albumId={id}
          albumTitle={album.name}
          isOpen={favoritedByOpen}
          onClose={() => setFavoritedByOpen(false)}
          viewerUserId={viewerUserId}
        />

        {friendActivity.length > 0 && <FriendsWhoListened activity={friendActivity} />}
      </div>
  );
}
