import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getOrFetchTrack, getOrFetchTracksBatch } from "@/lib/spotify-cache";
import { RecordRecentView } from "@/components/logging/record-recent-view";
import { getRelatedMedia } from "@/lib/discovery/getRelatedMedia";
import {
  getReviewsForEntity,
  getEntityStats,
  getListenLogsForTrack,
  getSongFriendLeaderboard,
} from "@/lib/queries";
import {
  GetOrCreateEntityError,
  getOrCreateEntity,
} from "@/lib/catalog/getOrCreateEntity";
import { redirectToCanonicalEntityIfNeeded } from "@/lib/catalog/redirect-to-canonical-entity-route";
import { formatStarDisplay } from "@/lib/ratings";
import { isUUID, isValidSpotifyId, normalizeReviewEntityId } from "@/lib/validation";
import { SongPageTabs } from "@/app/song/[id]/song-page-tabs";

type PageParams = Promise<{ id: string }>;

function formatDuration(ms: number | undefined) {
  if (!ms) return null;
  const min = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default async function SongPage({ params }: { params: PageParams }) {
  const { id: rawId } = await params;
  const id = normalizeReviewEntityId(rawId);

  if (!isUUID(id) && isValidSpotifyId(id)) {
    let resolvedId: string;
    try {
      resolvedId = (await getOrCreateEntity({ type: "track", spotifyId: id, allowNetwork: true })).id;
    } catch (e) {
      if (e instanceof GetOrCreateEntityError) notFound();
      throw e;
    }
    redirect(`/song/${resolvedId}`);
  }

  const [session, fetched] = await Promise.all([
    getSession(),
    getOrFetchTrack(id, { allowNetwork: true }).catch(() => {
      notFound();
    }),
  ]);

  redirectToCanonicalEntityIfNeeded("song", id, fetched.canonicalTrackId);
  const entityId = fetched.canonicalTrackId ?? id;
  const track = fetched.track;
  const viewerId = session?.user?.id ?? null;

  const [reviewsData, stats, recentListens, relatedTracks, leaderboard] =
    await Promise.all([
      getReviewsForEntity("song", entityId).catch(() => ({
        reviews: [],
        average_rating: null,
        count: 0,
        my_review: null,
      })),
      getEntityStats("song", entityId),
      getListenLogsForTrack(entityId, 8, 0, viewerId).catch(() => []),
      getRelatedMedia("song", entityId, 12)
        .then((relatedSongsRaw) => {
          const relatedTrackIds = relatedSongsRaw.map((r) => r.contentId);
          return relatedTrackIds.length > 0
            ? getOrFetchTracksBatch(relatedTrackIds, { allowNetwork: false })
            : Promise.resolve([]);
        })
        .then((res) =>
          (res ?? []).filter((t): t is SpotifyApi.TrackObjectFull => t != null),
        )
        .catch(() => []),
      viewerId
        ? getSongFriendLeaderboard(viewerId, entityId).catch(() => null)
        : Promise.resolve(null),
    ]);

  const album = track.album;
  const image = album?.images?.[0]?.url;
  const duration = formatDuration(track.duration_ms);
  const primaryArtist = track.artists?.[0];
  const myReview = reviewsData?.my_review ?? null;

  return (
    <div className="space-y-8">
      {session && (
        <RecordRecentView
          kind="song" id={entityId} title={track.name}
          subtitle={primaryArtist?.name ?? ""} artworkUrl={image ?? null}
          trackId={track.id} albumId={album?.id ?? null}
          artistId={primaryArtist?.id ?? null}
        />
      )}

      {/* ── Hero ─────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
        <div className="h-52 w-52 shrink-0 overflow-hidden rounded-2xl bg-zinc-800 shadow-[0_32px_64px_-24px_rgba(0,0,0,0.7)] ring-1 ring-inset ring-white/[0.08] sm:h-60 sm:w-60">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-6xl text-zinc-600">♪</div>
          )}
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Song</p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            {track.name}
          </h1>
          <p className="mt-2 text-base text-zinc-300">
            {track.artists?.map((a, i) => (
              <span key={a.id}>
                {i > 0 && <span className="text-zinc-600"> · </span>}
                <Link href={`/artist/${a.id}`} className="hover:text-emerald-400 hover:underline">
                  {a.name}
                </Link>
              </span>
            ))}
          </p>
          {album && (
            <p className="mt-1 text-sm text-zinc-500">
              From{" "}
              <Link href={`/album/${album.id}`} className="text-zinc-400 hover:text-emerald-400 hover:underline">
                {album.name}
              </Link>
            </p>
          )}
          {(duration || album?.release_date) && (
            <p className="mt-1.5 text-xs text-zinc-600">
              {duration}
              {duration && album?.release_date ? " · " : ""}
              {album?.release_date && new Date(album.release_date).getFullYear()}
            </p>
          )}

          {/* Community stats */}
          <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm sm:justify-start">
            {stats.average_rating != null && (
              <span>
                <span className="text-amber-400">★ {stats.average_rating.toFixed(1)}</span>
                <span className="ml-1 text-zinc-500">avg</span>
              </span>
            )}
            {stats.listen_count > 0 && (
              <span>
                <span className="font-semibold text-white">{stats.listen_count.toLocaleString()}</span>{" "}
                <span className="text-zinc-400">plays</span>
              </span>
            )}
            {stats.review_count > 0 && (
              <span>
                <span className="font-semibold text-white">{stats.review_count}</span>{" "}
                <span className="text-zinc-400">review{stats.review_count !== 1 ? "s" : ""}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Your rating */}
      {myReview && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 px-4 py-3 text-sm">
          <span className="text-zinc-400">
            Your rating: <span className="text-amber-400">{formatStarDisplay(myReview.rating)}</span>
          </span>
          {myReview.review_text && (
            <><span className="text-zinc-700">·</span>
              <span className="line-clamp-1 italic text-zinc-300">"{myReview.review_text}"</span></>
          )}
        </div>
      )}

      {/* Tabs */}
      <SongPageTabs
        entityId={entityId}
        trackName={track.name}
        reviewsInitialData={reviewsData}
        recentListens={recentListens}
        leaderboard={leaderboard}
        hasSocial={!!viewerId}
        albumImageUrl={image ?? null}
        relatedTracks={relatedTracks}
      />
    </div>
  );
}
