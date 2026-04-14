import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/auth";
import { LogListenButton } from "@/components/logging/log-listen-button";
import { RecordRecentView } from "@/components/logging/record-recent-view";
import { getOrFetchArtist } from "@/lib/spotify-cache";
import { MediaGrid, type MediaItem } from "@/components/media/MediaGrid";
import { getTopTracksForArtist } from "@/lib/queries";
import { normalizeReviewEntityId } from "@/lib/validation";
import { ArtistPopularTracks } from "@/app/artist/[id]/artist-popular-tracks";
import { ArtistAlbumsSection } from "./artist-albums-section";
import { ArtistReviewsSection } from "./artist-reviews-section";
import { RecentListensSection } from "./recent-listens-section";

type PageParams = Promise<{ id: string }>;

/** Async RSC: data fetching. Wrapped in Suspense from page.tsx so route-level loading can finish immediately. */
export async function ArtistPageContent({ params }: { params: PageParams }) {
  const { id: rawId } = await params;
  /** Params may be `lfm%3A…` from links; DB + Spotify need `lfm:…`. */
  const id = normalizeReviewEntityId(rawId);
  const sessionPromise = getSession();
  const artistPromise = getOrFetchArtist(id, { allowNetwork: true });

  const [session, artistRes, topTracks] = await Promise.all([
    sessionPromise,
    artistPromise.catch(() => null),
    getTopTracksForArtist(id, 10),
  ]);

  if (!artistRes) {
    notFound();
  }
  const artist = artistRes;

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

      <Suspense
        fallback={<div className="h-64 animate-pulse rounded-2xl bg-zinc-900/50" />}
      >
        <ArtistAlbumsSection id={id} artistName={artist.name} />
      </Suspense>

      <Suspense
        fallback={<div className="h-48 animate-pulse rounded-2xl bg-zinc-900/50" />}
      >
        <ArtistReviewsSection id={id} />
      </Suspense>

      <Suspense fallback={null}>
        <RecentListensSection artistId={id} />
      </Suspense>
    </div>
  );
}
