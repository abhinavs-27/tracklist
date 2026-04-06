import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { AlbumPageClient } from "@/app/album/[id]/album-page-client";
import { AlbumRecommendationsLoader } from "@/app/album/[id]/album-recommendations-loader";
import { AlbumReviews } from "@/app/album/[id]/album-reviews";
import { AlbumReviewsProvider } from "@/app/album/[id]/album-reviews-context";
import { getEntityStats } from "@/lib/queries";
import { timeAsync } from "@/lib/profiling";
import { getOrFetchAlbum } from "@/lib/spotify-cache";
import { sectionGap } from "@/lib/ui/surface";
import { normalizeReviewEntityId } from "@/lib/validation";
import { isSocialInboxAndMusicRecUiEnabled } from "@/lib/feature-social-music-rec-ui";
import { AlbumEngagementLoader } from "./album-engagement-loader";
import { AlbumFriendActivityLoader } from "./album-friend-activity-loader";

type PageParams = Promise<{ id: string }>;

export default async function AlbumPage({ params }: { params: PageParams }) {
  const { id: rawId } = await params;
  const id = normalizeReviewEntityId(rawId);

  const sessionPromise = getServerSession(authOptions);

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
      const statsInner = statsRes.status === "fulfilled" ? statsRes.value : {
        listen_count: 0,
        average_rating: null,
        review_count: 0,
        rating_distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      };

      return {
        album: albumInner,
        tracks: tracksInner,
        stats: statsInner,
        session: sessionRes.status === "fulfilled" ? sessionRes.value : null,
      };
    },
    { id },
  );

  const viewerId = session?.user?.id ?? null;
  const showAlbumRecUi = isSocialInboxAndMusicRecUiEnabled();

  const defaultEngagement = {
    listen_count: 0,
    review_count: 0,
    avg_rating: null as number | null,
    favorite_count: 0,
  };

  return (
    <AlbumReviewsProvider albumId={id}>
      <div className={sectionGap}>
        <Suspense
          fallback={
            <AlbumPageClient
              id={id}
              album={album}
              tracks={tracks}
              session={!!session}
              viewerUserId={viewerId}
              stats={stats}
              engagementStats={defaultEngagement}
              friendActivity={[]}
            />
          }
        >
          <AlbumEngagementLoader albumId={id}>
            {(engagementStats) => (
              <AlbumFriendActivityLoader viewerId={viewerId} albumId={id}>
                {(friendActivity) => (
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
                )}
              </AlbumFriendActivityLoader>
            )}
          </AlbumEngagementLoader>
        </Suspense>

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
