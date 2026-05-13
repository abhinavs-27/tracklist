import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AlbumPageClient, AlbumEngagementSection, AlbumRatingDistributionSection } from "@/app/album/[id]/album-page-client";
import { AlbumRecommendationsLoader } from "@/app/album/[id]/album-recommendations-loader";
import { AlbumReviewsProvider } from "@/app/album/[id]/album-reviews-context";
import { getAlbumEngagementStats, getEntityStats, getFriendsAlbumActivity, getViewerAlbumTrackRatings } from "@/lib/queries";
import { AlbumFriendLeaderboard } from "@/app/album/[id]/album-friend-leaderboard";
import { scheduleAlbumCatalogWarmupAfterNavigation } from "@/lib/catalog/album-warmup";
import { getOrCreateEntity, withTimeout } from "@/lib/catalog/getOrCreateEntity";
import { spotifyResolverRouteTimeoutMs } from "@/lib/catalog/spotify-resolver-timeout";
import { redirectToCanonicalEntityIfNeeded } from "@/lib/catalog/redirect-to-canonical-entity-route";
import { getOrFetchAlbum } from "@/lib/spotify-cache";
import {
  isUUID,
  isValidSpotifyId,
  normalizeReviewEntityId,
} from "@/lib/validation";
import { isSocialInboxAndMusicRecUiEnabled } from "@/lib/feature-social-music-rec-ui";
import { formatStarDisplay } from "@/lib/ratings";
import { formatRelativeTime } from "@/lib/time";

type PageParams = Promise<{ id: string }>;

async function FriendActivityFetcher({ viewerId, entityId, albumImage }: { viewerId: string; entityId: string; albumImage: string | null }) {
  const friendActivity = await getFriendsAlbumActivity(viewerId, entityId, 10);
  if (friendActivity.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-500">No friends have listened to this album recently.</p>;
  }

  return (
    <ul className="space-y-2">
      {friendActivity.map((l, i) => (
        <li key={`${l.user_id}-${l.listened_at}-${i}`}>
          <div className="flex items-center gap-3 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 px-3 py-2.5 transition hover:bg-zinc-900/60">
            {albumImage && (
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/[0.07]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={albumImage} alt="" className="h-full w-full object-cover" loading="lazy" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug">
                <Link href={`/profile/${l.user_id}`} className="font-semibold text-white hover:underline">{l.username}</Link>
                <span className="text-zinc-400"> listened</span>
                {l.rating != null && (
                  <span className="ml-1.5 text-amber-400">{formatStarDisplay(l.rating)}</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">{formatRelativeTime(l.listened_at)}</p>
            </div>
            <Link href={`/profile/${l.user_id}`} className="shrink-0">
              {l.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={l.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-white/10" />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-400 ring-1 ring-white/10">
                  {l.username[0]?.toUpperCase()}
                </span>
              )}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

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

  const [session, fetched] = await Promise.all([
    getSession(),
    getOrFetchAlbum(id, { allowNetwork: true }).catch(() => {
      notFound();
    }),
  ]);

  const album = fetched.album;
  const tracks = fetched.tracks;
  redirectToCanonicalEntityIfNeeded("album", id, fetched!.canonicalAlbumId);
  const entityId = fetched!.canonicalAlbumId ?? id;
  const viewerId = session?.user?.id ?? null;
  const trackIds = (tracks.items ?? []).map((t) => t.id);

  scheduleAlbumCatalogWarmupAfterNavigation(entityId);

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

  const engagementStatsPromise = getAlbumEngagementStats(entityId);
  const engagementStatsNode = (
    <Suspense fallback={<div className="h-5 w-32 animate-pulse rounded bg-zinc-800/50" />}>
      <AlbumEngagementSection statsPromise={engagementStatsPromise} albumId={entityId} albumName={album.name} viewerUserId={viewerId} />
    </Suspense>
  );

  const ratingDistributionPromise = getEntityStats("album", entityId);
  const ratingDistributionNode = (
    <Suspense fallback={<div className="mt-3 h-10 w-48 animate-pulse rounded bg-zinc-800/50" />}>
      <AlbumRatingDistributionSection statsPromise={ratingDistributionPromise} />
    </Suspense>
  );

  const friendActivityNode = viewerId ? (
    <Suspense fallback={<div className="space-y-2">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-16 w-full animate-pulse rounded-2xl bg-zinc-900/50" />
      ))}
    </div>}>
      <FriendActivityFetcher viewerId={viewerId} entityId={entityId} albumImage={album.images?.[0]?.url ?? null} />
    </Suspense>
  ) : <p className="py-8 text-center text-sm text-zinc-500">Sign in to see friend activity.</p>;

  const viewerTrackRatingsPromise = viewerId
    ? getViewerAlbumTrackRatings(viewerId, trackIds)
    : Promise.resolve(new Map<string, number>());

  return (
    <AlbumReviewsProvider albumId={entityId}>
      <AlbumPageClient
        id={entityId}
        album={album}
        tracks={tracks}
        session={!!session}
        viewerUserId={viewerId}
        recommendationsNode={recommendationsNode}
        leaderboardNode={leaderboardNode}
        engagementStatsNode={engagementStatsNode}
        ratingDistributionNode={ratingDistributionNode}
        friendActivityNode={friendActivityNode}
        viewerTrackRatingsPromise={viewerTrackRatingsPromise}
      />
    </AlbumReviewsProvider>
  );
}
