import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { AlbumPageClient } from "@/app/album/[id]/album-page-client";
import { AlbumRecommendationsLoader } from "@/app/album/[id]/album-recommendations-loader";
import { AlbumReviews } from "@/app/album/[id]/album-reviews";
import { AlbumReviewsProvider } from "@/app/album/[id]/album-reviews-context";
import {
  getEntityStats,
  getAlbumEngagementStats,
  getFriendsAlbumActivity,
} from "@/lib/queries";
import { timeAsync } from "@/lib/profiling";
import { getOrFetchAlbum } from "@/lib/spotify-cache";
import { sectionGap } from "@/lib/ui/surface";
import { normalizeReviewEntityId } from "@/lib/validation";

type PageParams = Promise<{ id: string }>;

export default async function AlbumPage({ params }: { params: PageParams }) {
  const { id: rawId } = await params;
  const id = normalizeReviewEntityId(rawId);
  const session = await getServerSession(authOptions);

  const viewerId = session?.user?.id ?? null;

  const { album, tracks, settled } = await timeAsync(
    "page",
    "albumPage",
    async () => {
      const settledInner = await Promise.allSettled([
        getOrFetchAlbum(id, { allowNetwork: true }),
        getEntityStats("album", id),
        getAlbumEngagementStats(id),
        viewerId
          ? getFriendsAlbumActivity(viewerId, id, 10)
          : Promise.resolve([]),
      ]);

      if (settledInner[0].status !== "fulfilled") {
        notFound();
      }

      const { album: albumInner, tracks: tracksInner } = settledInner[0].value;

      return {
        album: albumInner,
        tracks: tracksInner,
        settled: settledInner,
      };
    },
    { id },
  );

  const defaultStats = {
    listen_count: 0,
    average_rating: null as number | null,
    review_count: 0,
    rating_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as const,
  };
  const defaultEngagement = { listen_count: 0, review_count: 0, avg_rating: null as number | null };

  const stats = settled[1].status === "fulfilled" ? settled[1].value : defaultStats;
  if (settled[1].status === "rejected") console.error("[album] getEntityStats failed:", settled[1].reason);

  const engagementStats = settled[2].status === "fulfilled" ? settled[2].value : defaultEngagement;
  if (settled[2].status === "rejected") console.error("[album] getAlbumEngagementStats failed:", settled[2].reason);

  const friendActivity = settled[3].status === "fulfilled" ? settled[3].value : [];
  if (settled[3].status === "rejected") console.error("[album] getFriendsAlbumActivity failed:", settled[3].reason);

  return (
    <AlbumReviewsProvider albumId={id}>
      <div className={sectionGap}>
        <AlbumPageClient
          id={id}
          album={album}
          tracks={tracks}
          session={!!session}
          stats={stats}
          engagementStats={engagementStats}
          friendActivity={friendActivity}
        />
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
        <AlbumReviews albumId={id} albumName={album.name} />
      </div>
    </AlbumReviewsProvider>
  );
}
