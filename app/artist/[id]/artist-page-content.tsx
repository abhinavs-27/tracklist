import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import {
  isArtistPageDebugEnabled,
  withArtistPagePhaseLog,
} from "@/lib/artist-page-load-log";
import { redirectToCanonicalEntityIfNeeded } from "@/lib/catalog/redirect-to-canonical-entity-route";
import { getOrFetchArtist } from "@/lib/spotify-cache";
import { MediaGrid, type MediaItem } from "@/components/media/MediaGrid";
import {
  getTopTracksForArtist,
  getReviewsForArtist,
  getPopularAlbumsForArtist,
  getViewerArtistStats,
  getArtistFirstListenDate,
  type ArtistReview,
} from "@/lib/queries";
import { formatStarDisplay } from "@/lib/ratings";
import { formatRelativeTime } from "@/lib/time";
import { normalizeReviewEntityId } from "@/lib/validation";
import { ArtistPopularTracks } from "@/app/artist/[id]/artist-popular-tracks";
import { RecentListensSection } from "./recent-listens-section";
import { ArtistFriendLeaderboard } from "./artist-friend-leaderboard";
import { ArtistTabs } from "./artist-tabs";

type PageParams = Promise<{ id: string }>;

export async function ArtistPageContent({ params }: { params: PageParams }) {
  const { id: rawId } = await params;
  const id = normalizeReviewEntityId(rawId);

  const [session, artistFetched] = await Promise.all([
    withArtistPagePhaseLog("getSession", id, getSession()),
    withArtistPagePhaseLog(
      "getOrFetchArtist",
      id,
      getOrFetchArtist(id, { allowNetwork: true }),
      (v) => ({
        name: v.artist.name,
        hasImage: Boolean(v.artist.images?.[0]?.url),
      }),
    ).catch(() => null),
  ]);

  if (!artistFetched) notFound();
  redirectToCanonicalEntityIfNeeded("artist", id, artistFetched.canonicalArtistId);
  const entityId = artistFetched.canonicalArtistId ?? id;
  const artist = artistFetched.artist;
  const viewerId = session?.user?.id ?? null;

  const [topTracks, recentReviews, popularAlbumsResult, viewerStats, firstListened] =
    await Promise.all([
      withArtistPagePhaseLog("getTopTracksForArtist", id, getTopTracksForArtist(entityId, 10)),
      withArtistPagePhaseLog("getReviewsForArtist", id, getReviewsForArtist(entityId, 6)),
      withArtistPagePhaseLog("getPopularAlbumsForArtist", id, getPopularAlbumsForArtist(entityId, 8)),
      viewerId ? getViewerArtistStats(viewerId, entityId).catch(() => null) : Promise.resolve(null),
      viewerId ? getArtistFirstListenDate(viewerId, entityId).catch(() => null) : Promise.resolve(null),
    ]);

  const popularAlbums = popularAlbumsResult.rows;
  const showAlbumsViewMore = popularAlbumsResult.hasMoreAlbums;
  const heroTrack = topTracks[0]?.track ?? null;
  const image = artist.images?.[0]?.url;

  // Derive community stats from albums already fetched
  const totalCommunityPlays = popularAlbums.reduce((s, a) => s + (a.listen_count ?? 0), 0);
  const ratedAlbums = popularAlbums.filter((a) => a.average_rating != null);
  const avgRating =
    ratedAlbums.length > 0
      ? ratedAlbums.reduce((s, a) => s + (a.average_rating ?? 0), 0) / ratedAlbums.length
      : null;

  return (
    <>
    {/* Mobile fixed header — artist name, covers layout nav on mobile */}
    <header className="fixed left-0 right-0 top-0 z-[60] border-b border-white/[0.06] bg-zinc-950/95 px-4 pb-3 pt-4 backdrop-blur-xl sm:px-6 md:hidden">
      <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Artist</p>
      <h1 className="mt-0.5 text-xl font-bold tracking-tight text-white">{artist.name}</h1>
    </header>
    <div className="h-[4.5rem] md:hidden" />

    <div className="space-y-8">
      {/* Hero — album-page style: blurred bg + full photo at proper size */}
      <div className="relative overflow-hidden rounded-2xl bg-zinc-900">
        {image && (
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" className="h-full w-full scale-150 object-cover opacity-[0.18] blur-3xl" />
            <div className="absolute inset-0 bg-zinc-950/65" />
          </div>
        )}
        {!image && <div className="absolute inset-0 bg-gradient-to-br from-zinc-900/90 via-zinc-900 to-zinc-950" />}

        <div className="relative flex flex-col items-center gap-6 p-6 sm:flex-row sm:items-start sm:gap-8 sm:p-8">
          {/* Artist photo — full, uncropped */}
          <div className="h-52 w-52 shrink-0 overflow-hidden rounded-2xl bg-zinc-800 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] ring-1 ring-inset ring-white/[0.08] sm:h-60 sm:w-60">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-6xl text-zinc-600">♪</div>
            )}
          </div>

          {/* Metadata */}
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="text-xs font-medium uppercase tracking-widest text-zinc-500">Artist</p>
            <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {artist.name}
            </h1>
            {artist.genres?.length ? (
              <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {artist.genres.slice(0, 4).map((g) => (
                  <span key={g} className="rounded-full bg-white/[0.10] px-2.5 py-0.5 text-xs font-medium text-zinc-300 ring-1 ring-white/[0.08]">
                    {g}
                  </span>
                ))}
              </div>
            ) : null}
            {artist.followers?.total ? (
              <p className="mt-2 text-sm text-zinc-500">
                {artist.followers.total.toLocaleString()} followers on Spotify
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Community stats */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        {totalCommunityPlays > 0 && (
          <span>
            <span className="font-semibold text-white">
              {totalCommunityPlays.toLocaleString()}
            </span>{" "}
            <span className="text-zinc-400">plays on Tracklist</span>
          </span>
        )}
        {avgRating != null && (
          <span>
            <span className="text-amber-400">
              {formatStarDisplay(Math.round(avgRating * 2) / 2)}
            </span>{" "}
            <span className="text-zinc-500">avg rating</span>
          </span>
        )}
        {popularAlbums.length > 0 && (
          <span>
            <span className="font-semibold text-white">{popularAlbums.length}</span>
            {showAlbumsViewMore ? "+" : ""}{" "}
            <span className="text-zinc-500">albums</span>
          </span>
        )}
      </div>

      {/* Your relationship with this artist */}
      {viewerStats && viewerStats.playCount > 0 && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl border border-zinc-800/60 bg-zinc-900/40 px-4 py-3 text-sm">
          <span>
            <span className="font-semibold text-white">
              {viewerStats.playCount.toLocaleString()}
            </span>{" "}
            <span className="text-zinc-400">
              {viewerStats.playCount === 1 ? "play" : "plays"} by you
            </span>
          </span>
          {viewerStats.topAlbumName && viewerStats.topAlbumId && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="text-zinc-400">
                Favourite:{" "}
                <Link
                  href={`/album/${viewerStats.topAlbumId}`}
                  className="font-medium text-white hover:text-emerald-400 hover:underline"
                >
                  {viewerStats.topAlbumName}
                </Link>
              </span>
            </>
          )}
          {firstListened && (
            <>
              <span className="text-zinc-700">·</span>
              <span className="text-zinc-400">
                Since{" "}
                <span className="font-medium text-white">
                  {new Date(firstListened).toLocaleDateString(undefined, {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </span>
            </>
          )}
        </div>
      )}

      <ArtistTabs
        hasSocial={!!viewerId}
        generalContent={
          <div className="space-y-8">
            {topTracks?.length ? <ArtistPopularTracks tracks={topTracks} /> : null}

            {popularAlbums.length > 0 && (
              <section>
                <div className="mb-3 flex items-end justify-between">
                  <h2 className="text-lg font-semibold text-white">Albums</h2>
                  {showAlbumsViewMore && (
                    <Link
                      href={`/artist/${entityId}/albums`}
                      className="text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:underline"
                    >
                      View all
                    </Link>
                  )}
                </div>
                <MediaGrid
                  items={popularAlbums.map(
                    (a): MediaItem => ({
                      id: a.id,
                      type: "album",
                      title: a.name,
                      artist: artist.name,
                      artworkUrl: a.image_url ?? null,
                      avgRating: a.average_rating ?? undefined,
                      totalPlays: a.listen_count,
                    }),
                  )}
                  columns={3}
                  showArtist={false}
                />
              </section>
            )}

            {recentReviews.length > 0 && (
              <section>
                <h2 className="mb-3 text-lg font-semibold text-white">Reviews</h2>
                <ul className="space-y-3">
                  {recentReviews.map((r: ArtistReview) => {
                    const entityHref = r.entity_type === "album"
                      ? `/album/${r.entity_id}`
                      : `/song/${r.entity_id}`;
                    return (
                      <li key={r.id} className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-4">
                        <Link href={entityHref} className="group flex items-center gap-3">
                          {r.entity_image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.entity_image_url}
                              alt=""
                              className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-white/[0.07] transition group-hover:ring-white/20"
                            />
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-600">♪</div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white group-hover:text-emerald-400 group-hover:underline">
                              {r.entity_name ?? (r.entity_type === "album" ? "Album" : "Track")}
                            </p>
                            <p className="mt-0.5 text-base text-amber-400 leading-none">
                              {formatStarDisplay(Math.max(0, Math.min(5, Number(r.rating))))}
                            </p>
                          </div>
                        </Link>
                        {r.review_text && (
                          <p className="mt-3 line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-zinc-300">
                            {r.review_text}
                          </p>
                        )}
                        <div className="mt-3 flex items-center gap-2 border-t border-zinc-800/60 pt-3">
                          <Link href={r.user_id ? `/profile/${r.user_id}` : "#"} className="shrink-0">
                            {r.user?.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.user.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover ring-1 ring-white/10" />
                            ) : (
                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-400">
                                {(r.username ?? "?")[0]?.toUpperCase()}
                              </span>
                            )}
                          </Link>
                          <Link href={r.user_id ? `/profile/${r.user_id}` : "#"} className="text-xs font-medium text-zinc-400 hover:text-white hover:underline">
                            {r.username ?? "Unknown"}
                          </Link>
                          <span className="text-zinc-700">·</span>
                          <span className="text-xs text-zinc-600">{formatRelativeTime(r.created_at)}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        }
        socialContent={
          <div className="space-y-8">
            {viewerId && (
              <Suspense fallback={null}>
                <ArtistFriendLeaderboard viewerId={viewerId} canonicalArtistId={entityId} />
              </Suspense>
            )}
            <RecentListensSection artistId={entityId} viewerId={viewerId} />
          </div>
        }
      />
    </div>
    </>
  );
}
