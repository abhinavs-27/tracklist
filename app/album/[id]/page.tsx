import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AlbumPageClient } from "@/app/album/[id]/album-page-client";
import { AlbumRecommendationsLoader } from "@/app/album/[id]/album-recommendations-loader";
import { AlbumReviews } from "@/app/album/[id]/album-reviews";
import { AlbumReviewsProvider } from "@/app/album/[id]/album-reviews-context";
import { getAlbumEngagementStats, getEntityStats, getFriendsAlbumActivity } from "@/lib/queries";
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

  console.log("[Album Resolve] incoming:", id);

  if (!isUUID(id) && isValidSpotifyId(id)) {
    let resolvedId: string;
    console.log("[Album Route] resolving:", id);
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
    } catch (err) {
      console.error("[Resolver ERROR]", err);
      notFound();
    }
    console.log("[Album Route] resolved:", resolvedId);
    redirect(`/album/${resolvedId}`);
  }

  const {
    album,
    tracks,
    stats,
    session,
    engagementStats,
    friendActivity,
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
      const sessionVal = await withAlbumPagePhaseLog("getSession", id, getSession());

      let albumInner: Awaited<ReturnType<typeof getOrFetchAlbum>>["album"];
      let tracksInner: Awaited<ReturnType<typeof getOrFetchAlbum>>["tracks"];
      let fetched: Awaited<ReturnType<typeof getOrFetchAlbum>>;
      try {
        fetched = await withAlbumPagePhaseLog(
          "getOrFetchAlbum",
          id,
          getOrFetchAlbum(id, { allowNetwork: true }),
        );
        albumInner = fetched.album;
        tracksInner = fetched.tracks;
      } catch {
        notFound();
      }
      redirectToCanonicalEntityIfNeeded("album", id, fetched!.canonicalAlbumId);
      const entityIdInner = fetched!.canonicalAlbumId ?? id;

      /**
       * Sequential Supabase server work: parallel `createSupabaseServerClient()` (each awaits
       * `cookies()`) has deadlocked RSC — same pattern as `artist-page-content.tsx`.
       */
      const viewerId = sessionVal?.user?.id ?? null;
      const statsInner = await withAlbumPagePhaseLog(
        "getEntityStats(album)",
        id,
        getEntityStats("album", entityIdInner),
      );
      const engagementInner = await withAlbumPagePhaseLog(
        "getAlbumEngagementStats",
        id,
        getAlbumEngagementStats(entityIdInner),
      );
      const friendActivityInner = viewerId
        ? await getFriendsAlbumActivity(viewerId, entityIdInner, 10)
        : [];

      return {
        album: albumInner,
        tracks: tracksInner,
        stats: statsInner,
        session: sessionVal,
        engagementStats: engagementInner,
        friendActivity: friendActivityInner,
        entityId: entityIdInner,
      };
    },
    { id },
  );

  scheduleAlbumCatalogWarmupAfterNavigation(entityId);

  const viewerId = session?.user?.id ?? null;
  const showAlbumRecUi = isSocialInboxAndMusicRecUiEnabled();

  return (
    <AlbumReviewsProvider albumId={entityId}>
      <div className={sectionGap}>
        <AlbumPageClient
          id={entityId}
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
            <AlbumRecommendationsLoader albumId={entityId} albumName={album.name} />
          </Suspense>
        ) : null}
        <AlbumReviews albumId={entityId} albumName={album.name} />
      </div>
    </AlbumReviewsProvider>
  );
}
