import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AlbumPageClient } from "@/app/album/[id]/album-page-client";
import { AlbumRecommendationsLoader } from "@/app/album/[id]/album-recommendations-loader";
import { AlbumReviews } from "@/app/album/[id]/album-reviews";
import { AlbumReviewsProvider } from "@/app/album/[id]/album-reviews-context";
import { AlbumStatsSection } from "@/app/album/[id]/album-stats-section";
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
      const [albumRes, statsRes, sessionRes] = await Promise.allSettled([
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
          stats={stats}
        >
          <Suspense fallback={<div className="h-10 animate-pulse rounded bg-zinc-800/50" />}>
            <AlbumStatsSection
              albumId={id}
              albumName={album.name}
              viewerUserId={viewerId}
              initialListenCount={stats.listen_count}
              initialReviewCount={stats.review_count}
              initialAvgRating={stats.average_rating}
            />
          </Suspense>
        </AlbumPageClient>

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
