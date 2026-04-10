import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AlbumPageClient } from "@/app/album/[id]/album-page-client";
import { AlbumRecommendationsLoader } from "@/app/album/[id]/album-recommendations-loader";
import { AlbumReviews } from "@/app/album/[id]/album-reviews";
import { AlbumReviewsProvider } from "@/app/album/[id]/album-reviews-context";
import { getAlbumEngagementStats, getEntityStats, getFriendsAlbumActivity } from "@/lib/queries";
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

  const { album, tracks, stats, session, engagementStats, friendActivity } = await timeAsync(
    "page",
    "albumPage",
    async () => {
      // 1) Fetch base data: session and album metadata
      const [session, albumRes] = await Promise.all([
        getSession(),
        getOrFetchAlbum(id, { allowNetwork: true }).catch(() => null),
      ]);

      if (!albumRes) {
        notFound();
      }

      const { album: albumInner, tracks: tracksInner } = albumRes;
      const userId = session?.user?.id ?? null;

      // 2) Parallelize stats and social activity now that we have session + album info
      const [statsRes, friendActivityRes] = await Promise.allSettled([
        getEntityStats("album", id),
        userId ? getFriendsAlbumActivity(userId, id, 10) : Promise.resolve([]),
      ]);

      const statsInner =
        statsRes.status === "fulfilled"
          ? statsRes.value
          : {
              listen_count: 0,
              average_rating: null,
              review_count: 0,
              rating_distribution: {
                "1": 0, "1.5": 0, "2": 0, "2.5": 0, "3": 0, "3.5": 0, "4": 0, "4.5": 0, "5": 0,
              },
            };

      const friendActivityInner =
        friendActivityRes.status === "fulfilled" ? friendActivityRes.value : [];

      // 3) Engagement stats (likes/favorites) reuse the stats we just fetched
      const engagementInner = await getAlbumEngagementStats(id, {
        initialStats: statsInner,
      });

      return {
        album: albumInner,
        tracks: tracksInner,
        stats: statsInner,
        session,
        engagementStats: engagementInner,
        friendActivity: friendActivityInner,
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
          stats={stats}
          engagementStats={engagementStats}
          friendActivity={friendActivity}
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
