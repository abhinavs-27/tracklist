import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AlbumPageClient } from "@/app/album/[id]/album-page-client";
import { AlbumRecommendationsLoader } from "@/app/album/[id]/album-recommendations-loader";
import { AlbumReviewsProvider } from "@/app/album/[id]/album-reviews-context";
import { getAlbumEngagementStats, getEntityStats, getFriendsAlbumActivity, getViewerAlbumTrackRatings } from "@/lib/queries";
import { AlbumFriendLeaderboard } from "@/app/album/[id]/album-friend-leaderboard";
import { timeAsync } from "@/lib/profiling";
import { scheduleAlbumCatalogWarmupAfterNavigation } from "@/lib/catalog/album-warmup";
import { getOrCreateEntity, withTimeout } from "@/lib/catalog/getOrCreateEntity";
import { spotifyResolverRouteTimeoutMs } from "@/lib/catalog/spotify-resolver-timeout";
import { redirectToCanonicalEntityIfNeeded } from "@/lib/catalog/redirect-to-canonical-entity-route";
import { getOrFetchAlbum } from "@/lib/spotify-cache";
import { sectionGap } from "@/lib/ui/surface";
import {
  isUUID,
  isValidSpotifyId,
  normalizeReviewEntityId,
} from "@/lib/validation";
import { isSocialInboxAndMusicRecUiEnabled } from "@/lib/feature-social-music-rec-ui";
import { withAlbumPagePhaseLog } from "@/lib/album-page-load-log";

type PageParams = Promise<{ id: string }>;

export default async function AlbumPage({ params }: { params: PageParams }) {
  const { id: rawId } = await params;
  const id = normalizeReviewEntityId(rawId);

  if (!isUUID(id) && isValidSpotifyId(id)) {
    let resolvedId: string;
    try {
      resolvedId = (
        await withTimeout(
          getOrCreateEntity({
            type: "album",
            spotifyId: id,
            allowNetwork: true,
          }),
          spotifyResolverRouteTimeoutMs(),
        )
      ).id;
    } catch {
      notFound();
    }
    redirect(`/album/${resolvedId}`);
  }

  const {
    album,
    tracks,
    stats,
    session,
    engagementStats,
    friendActivity,
    viewerTrackRatings,
    entityId,
  } = await timeAsync(
    "page",
    "albumPage",
    async () => {
      /**
       * Phase 1: session + catalog fetch must finish before stats / friends / engagement.
       * Those paths resolve canonical album UUID via `album_external_ids`; parallel runs
       * raced `getOrFetchAlbum` upserts and returned empty / `no_canonical_album`.
       */
      const [sessionVal, fetched] = await Promise.all([
        withAlbumPagePhaseLog("getSession", id, getSession()),
        withAlbumPagePhaseLog(
          "getOrFetchAlbum",
          id,
          getOrFetchAlbum(id, { allowNetwork: true }),
        ).catch(() => {
          notFound();
        }),
      ]);

      const albumInner = fetched.album;
      const tracksInner = fetched.tracks;
      redirectToCanonicalEntityIfNeeded("album", id, fetched!.canonicalAlbumId);
      const entityIdInner = fetched!.canonicalAlbumId ?? id;

      /**
       * Sequential Supabase server work: parallel `createSupabaseServerClient()` (each awaits
       * `cookies()`) has deadlocked RSC — same pattern as `artist-page-content.tsx`.
       */
      const viewerId = sessionVal?.user?.id ?? null;
      const trackIds = (tracksInner.items ?? []).map((t) => t.id);

      const [statsInner, engagementInner, friendActivityInner, viewerTrackRatingsInner] =
        await Promise.all([
          withAlbumPagePhaseLog(
            "getEntityStats(album)",
            id,
            getEntityStats("album", entityIdInner),
          ),
          withAlbumPagePhaseLog(
            "getAlbumEngagementStats",
            id,
            getAlbumEngagementStats(entityIdInner),
          ),
          viewerId
            ? getFriendsAlbumActivity(viewerId, entityIdInner, 10)
            : Promise.resolve([]),
          viewerId
            ? getViewerAlbumTrackRatings(viewerId, trackIds)
            : Promise.resolve(new Map<string, number>()),
        ]);

      return {
        album: albumInner,
        tracks: tracksInner,
        stats: statsInner,
        session: sessionVal,
        engagementStats: engagementInner,
        friendActivity: friendActivityInner,
        viewerTrackRatings: viewerTrackRatingsInner,
        entityId: entityIdInner,
      };
    },
    { id },
  );

  scheduleAlbumCatalogWarmupAfterNavigation(entityId);

  const viewerId = session?.user?.id ?? null;
  const showAlbumRecUi = isSocialInboxAndMusicRecUiEnabled();

  const recommendationsNode = showAlbumRecUi ? (
    <Suspense fallback={
      <div>
        <div className="mb-4 h-7 w-56 animate-pulse rounded-lg bg-zinc-800/60" />
        <div className="min-h-[88px] animate-pulse rounded-2xl bg-zinc-900/50 ring-1 ring-inset ring-white/[0.06]" />
      </div>
    }>
      <AlbumRecommendationsLoader albumId={entityId} albumName={album.name} />
    </Suspense>
  ) : null;

  const leaderboardNode = viewerId ? (
    <Suspense fallback={null}>
      <AlbumFriendLeaderboard viewerId={viewerId} albumId={entityId} />
    </Suspense>
  ) : null;

  return (
    <AlbumReviewsProvider albumId={entityId}>
      <AlbumPageClient
        id={entityId}
        album={album}
        tracks={tracks}
        session={!!session}
        viewerUserId={viewerId}
        stats={stats}
        engagementStats={engagementStats}
        friendActivity={friendActivity}
        viewerTrackRatings={viewerTrackRatings}
        recommendationsNode={recommendationsNode}
        leaderboardNode={leaderboardNode}
      />
    </AlbumReviewsProvider>
  );
}
