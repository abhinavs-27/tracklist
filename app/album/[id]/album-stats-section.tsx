import { getAlbumEngagementStats, getFriendsAlbumActivity } from "@/lib/queries";
import { AlbumEngagementSection } from "@/app/album/[id]/album-engagement-section";

export async function AlbumStatsSection({
  albumId,
  albumName,
  viewerUserId,
  initialListenCount,
  initialReviewCount,
  initialAvgRating,
}: {
  albumId: string;
  viewerUserId: string | null;
  initialListenCount: number;
  initialReviewCount: number;
  initialAvgRating: number | null;
}) {
  const [engagementRes, friendActivityRes] = await Promise.allSettled([
    getAlbumEngagementStats(albumId),
    viewerUserId ? getFriendsAlbumActivity(viewerUserId, albumId, 10) : Promise.resolve([]),
  ]);

  const engagementStats =
    engagementRes.status === "fulfilled"
      ? engagementRes.value
      : {
          listen_count: initialListenCount,
          review_count: initialReviewCount,
          avg_rating: initialAvgRating,
          favorite_count: 0,
        };

  const friendActivity =
    friendActivityRes.status === "fulfilled" ? friendActivityRes.value : [];

  return (
    <AlbumEngagementSection
      albumId={albumId}
      albumName={albumName}
      viewerUserId={viewerUserId}
      engagementStats={engagementStats}
      friendActivity={friendActivity}
    />
  );
}
