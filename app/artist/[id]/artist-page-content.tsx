import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { LogListenButton } from "@/components/logging/log-listen-button";
import { RecordRecentView } from "@/components/logging/record-recent-view";
import { getOrFetchArtist } from "@/lib/spotify-cache";
import { MediaGrid, type MediaItem } from "@/components/media/MediaGrid";
import {
  getTopTracksForArtist,
  getReviewsForArtist,
  getPopularAlbumsForArtist,
} from "@/lib/queries";
import { formatStarDisplay } from "@/lib/ratings";
import { normalizeReviewEntityId } from "@/lib/validation";
import { ArtistPopularTracks } from "@/app/artist/[id]/artist-popular-tracks";
import { RecentListensSection } from "./recent-listens-section";

type PageParams = Promise<{ id: string }>;

/** Async RSC: data fetching. Wrapped in Suspense from page.tsx so route-level loading can finish immediately. */
export async function ArtistPageContent({ params }: { params: PageParams }) {
  const { id: rawId } = await params;
  /** Params may be `lfm%3A…` from links; DB + Spotify need `lfm:…`. */
  const id = normalizeReviewEntityId(rawId);
  const session = await getServerSession(authOptions);

  let artist: SpotifyApi.ArtistObjectFull;
  try {
    artist = await getOrFetchArtist(id, { allowNetwork: true });
  } catch {
    notFound();
  }

  const [topTracks, popularAlbumsResult, recentReviews] =
    await Promise.all([
      getTopTracksForArtist(id, 10),
      getPopularAlbumsForArtist(id),
      getReviewsForArtist(id, 8),
    ]);

  const popularAlbums = popularAlbumsResult.rows;
  /** Spotify returned a full first page and a peek at offset=pageSize found more; full list loads on /albums. */
  const showAlbumsViewMore = popularAlbumsResult.hasMoreAlbums;

  const heroPopular = topTracks[0] ?? null;
  const heroTrack = heroPopular?.track ?? null;

  const image = artist.images?.[0]?.url;

  return (
    <div className="space-y-8">
      {session && heroTrack ? (
        <RecordRecentView
          kind="artist"
          id={id}
          title={artist.name}
          subtitle={
            artist.genres?.length ? artist.genres.slice(0, 5).join(" · ") : "Artist"
          }
          artworkUrl={image ?? null}
          trackId={heroTrack.id}
          albumId={heroTrack.album?.id ?? null}
          artistId={id}
        />
      ) : null}
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
        <div className="h-48 w-48 shrink-0 overflow-hidden rounded-xl bg-zinc-800 sm:h-56 sm:w-56">
          {image ? (
            <img src={image} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-6xl text-zinc-600">
              ♪
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-white">{artist.name}</h1>
          {artist.genres?.length ? (
            <p className="mt-1 text-zinc-400">
              {artist.genres.slice(0, 5).join(" · ")}
            </p>
          ) : null}
          {artist.followers != null && artist.followers.total > 0 && (
            <p className="mt-1 text-sm text-zinc-500">
              {artist.followers.total.toLocaleString()} followers on Spotify
            </p>
          )}
          {session && heroTrack ? (
            <div className="mt-4">
              <LogListenButton
                trackId={heroTrack.id}
                albumId={heroTrack.album?.id ?? null}
                artistId={id}
                displayName={artist.name}
              />
            </div>
          ) : null}
        </div>
      </div>

      {topTracks?.length ? <ArtistPopularTracks tracks={topTracks} /> : null}

      {popularAlbums.length > 0 ? (
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Albums</h2>
            {showAlbumsViewMore ? (
              <Link
                href={`/artist/${id}/albums`}
                className="text-sm font-medium text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                View more
              </Link>
            ) : null}
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
            columns={4}
          />
        </section>
      ) : null}

      {recentReviews.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Recent reviews
          </h2>
          <ul className="space-y-3">
            {recentReviews.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3"
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-amber-400">
                    {formatStarDisplay(Math.max(0, Math.min(5, Number(r.rating))))}
                  </span>
                  <Link
                    href={r.user_id ? `/profile/${r.user_id}` : "#"}
                    className="font-medium text-white hover:underline"
                  >
                    {r.username ?? "Unknown"}
                  </Link>
                  <span className="text-zinc-500">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
                {r.review_text && (
                  <p className="mt-1 whitespace-pre-line text-sm text-zinc-300">
                    {r.review_text}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Suspense fallback={null}>
        <RecentListensSection artistId={id} />
      </Suspense>
    </div>
  );
}
