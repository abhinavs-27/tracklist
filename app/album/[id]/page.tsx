import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AlbumPageClient } from "@/app/album/[id]/album-page-client";
import { AlbumRecommendationsLoader } from "@/app/album/[id]/album-recommendations-loader";
import { AlbumReviews } from "@/app/album/[id]/album-reviews";
import { AlbumReviewsProvider } from "@/app/album/[id]/album-reviews-context";
import { AlbumEngagementStats } from "@/app/album/[id]/album-engagement-stats";
import { AlbumFriendActivity } from "@/app/album/[id]/album-friend-activity";
import { getEntityStats } from "@/lib/queries";
import { timeAsync } from "@/lib/profiling";
import { scheduleAlbumCatalogWarmupAfterNavigation } from "@/lib/catalog/album-warmup";
import { getOrFetchAlbum } from "@/lib/spotify-cache";
import { sectionGap } from "@/lib/ui/surface";
import { normalizeReviewEntityId } from "@/lib/validation";
import { isSocialInboxAndMusicRecUiEnabled } from "@/lib/feature-social-music-rec-ui";

type PageParams = Promise<{ id: string }>;

export default async function AlbumPage({ params }: { params: PageParams }) {
  const { id: rawId } = await params;
  const id = normalizeReviewEntityId(rawId);

  const sessionPromise = getSession();

  const { album, tracks, stats, session } = await timeAsync(
    "page",
    "albumPage",
    async () => {
      const [albumRes, statsRes, sessionRes] =
        await Promise.allSettled([
          getOrFetchAlbum(id, { allowNetwork: true }),
          getEntityStats("album", id),
          sessionPromise,
        ]);

      if (albumRes.status !== "fulfilled") {
        notFound();
      }

      const { album: albumInner, tracks: tracksInner } = albumRes.value;
      const statsInner =
        statsRes.status === "fulfilled"
          ? statsRes.value
          : {
              listen_count: 0,
              average_rating: null,
              review_count: 0,
              rating_distribution: {
                "1": 0,
                "1.5": 0,
                "2": 0,
                "2.5": 0,
                "3": 0,
                "3.5": 0,
                "4": 0,
                "4.5": 0,
                "5": 0,
              },
            };

      const sessionVal =
        sessionRes.status === "fulfilled" ? sessionRes.value : null;

      return {
        album: albumInner,
        tracks: tracksInner,
        stats: statsInner,
        session: sessionVal,
      };
    },
    { id },
  );

  scheduleAlbumCatalogWarmupAfterNavigation(id);

  const viewerId = session?.user?.id ?? null;
  const showAlbumRecUi = isSocialInboxAndMusicRecUiEnabled();

  return (
    <AlbumReviewsProvider albumId={id}>
      <div className={sectionGap}>
        <AlbumPageClient
          id={id}
          album={album}
          tracks={tracks}
          session={!!session}
          viewerUserId={viewerId}
          statsSection={
            <Suspense
              fallback={
                <div className="mt-3 flex gap-x-4">
                  <div className="h-5 w-32 animate-pulse rounded bg-zinc-800/60" />
                  <div className="h-5 w-24 animate-pulse rounded bg-zinc-800/60" />
                </div>
              }
            >
              <AlbumEngagementStats albumId={id} serverStats={stats} />
            </Suspense>
          }
          friendActivitySection={
            viewerId ? (
              <Suspense fallback={null}>
                <AlbumFriendActivity userId={viewerId} albumId={id} />
              </Suspense>
            ) : null
          }
        />

        {showAlbumRecUi ? (
          <Suspense
            fallback={
              <div>
                <div className="mb-4 h-7 w-56 animate-pulse rounded-lg bg-zinc-800/60" />
                <div className="min-h-[88px] animate-pulse rounded-2xl bg-zinc-900/50 ring-1 ring-inset ring-white/[0.06]" />
              </div>
            }
          >
            <AlbumRecommendationsLoader albumId={id} albumName={album.name} />
          </Suspense>
        ) : null}
        <AlbumReviews albumId={id} albumName={album.name} />
      </div>
    </AlbumReviewsProvider>
  );
}
