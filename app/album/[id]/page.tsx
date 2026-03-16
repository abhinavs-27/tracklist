import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { AlbumPageClient } from "@/app/album/[id]/album-page-client";
import {
  getEntityStats,
  getAlbumEngagementStats,
  getFriendsAlbumActivity,
  getTrackStatsForTrackIds,
  getAlbumRecommendations,
} from "@/lib/queries";
import { timeAsync } from "@/lib/profiling";
import { getOrFetchAlbum, getOrFetchAlbumsBatch } from "@/lib/spotify-cache";

type PageParams = Promise<{ id: string }>;

export default async function AlbumPage({ params }: { params: PageParams }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  const { album, tracks, settled, recommendedAlbums } = await timeAsync(
    "page",
    "albumPage",
    async () => {
  let albumInner: SpotifyApi.AlbumObjectFull;
  let tracksInner: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
  try {
    const data = await getOrFetchAlbum(id);
    albumInner = data.album;
    tracksInner = data.tracks;
  } catch {
    notFound();
  }

  const trackIds = tracksInner.items?.map((t) => t.id) ?? [];
  const viewerId = session?.user?.id ?? null;

  const settledInner = await Promise.allSettled([
    getEntityStats("album", id),
    getAlbumEngagementStats(id),
    viewerId ? getFriendsAlbumActivity(viewerId, id, 10) : Promise.resolve([]),
    getTrackStatsForTrackIds(trackIds),
    getAlbumRecommendations(id, 10),
  ]);

  const recommendationAlbumIds = (settledInner[4].status === "fulfilled" ? settledInner[4].value : []).map((r: { album_id: string }) => r.album_id);
  const recommendationAlbumResults =
    recommendationAlbumIds.length > 0
      ? await getOrFetchAlbumsBatch(recommendationAlbumIds)
      : [];
  const recommendedAlbumsInner = recommendationAlbumResults.filter(
    (a): a is SpotifyApi.AlbumObjectSimplified => a != null,
  );

  return {
    album: albumInner,
    tracks: tracksInner,
    settled: settledInner,
    recommendedAlbums: recommendedAlbumsInner,
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

  const stats = settled[0].status === "fulfilled" ? settled[0].value : defaultStats;
  if (settled[0].status === "rejected") console.error("[album] getEntityStats failed:", settled[0].reason);

  const engagementStats = settled[1].status === "fulfilled" ? settled[1].value : defaultEngagement;
  if (settled[1].status === "rejected") console.error("[album] getAlbumEngagementStats failed:", settled[1].reason);

  const friendActivity = settled[2].status === "fulfilled" ? settled[2].value : [];
  if (settled[2].status === "rejected") console.error("[album] getFriendsAlbumActivity failed:", settled[2].reason);

  const trackStats = settled[3].status === "fulfilled" ? settled[3].value : {} as Record<string, { listen_count: number; average_rating: number | null; review_count: number }>;
  if (settled[3].status === "rejected") console.error("[album] getTrackStatsForTrackIds failed:", settled[3].reason);

  if (settled[4].status === "rejected") console.error("[album] getAlbumRecommendations failed:", settled[4].reason);

  return (
    <AlbumPageClient
      id={id}
      album={album}
      tracks={tracks}
      session={!!session}
      stats={stats}
      engagementStats={engagementStats}
      friendActivity={friendActivity}
      trackStats={trackStats}
      recommendedAlbums={recommendedAlbums}
    />
  );
}
