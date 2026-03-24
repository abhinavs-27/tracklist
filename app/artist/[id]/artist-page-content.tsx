import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { LogListenButton } from "@/components/logging/log-listen-button";
import { RecordRecentView } from "@/components/logging/record-recent-view";
import { getOrFetchArtist, getOrFetchTrack } from "@/lib/spotify-cache";
import { getArtistTopTracks } from "@/lib/spotify";
import { TrackCard } from "@/components/track-card";
import { ListenCard } from "@/components/listen-card";
import { MediaGrid, type MediaItem } from "@/components/media/MediaGrid";
import {
  getTopTracksForArtist,
  getReviewsForArtist,
  getListenLogsForArtist,
  getPopularAlbumsForArtist,
} from "@/lib/queries";

type PageParams = Promise<{ id: string }>;

/** Async RSC: data fetching. Wrapped in Suspense from page.tsx so route-level loading can finish immediately. */
export async function ArtistPageContent({ params }: { params: PageParams }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  let artist: SpotifyApi.ArtistObjectFull;
  let spotifyTopTrack: SpotifyApi.TrackObjectFull | null = null;
  try {
    const [a, topData] = await Promise.all([
      getOrFetchArtist(id),
      getArtistTopTracks(id).catch(() => ({
        tracks: [] as SpotifyApi.TrackObjectFull[],
      })),
    ]);
    artist = a;
    spotifyTopTrack = topData.tracks?.[0] ?? null;
  } catch {
    notFound();
  }

  const [topTracks, popularAlbums, recentReviews, recentListensRaw] =
    await Promise.all([
      getTopTracksForArtist(id, 10),
      getPopularAlbumsForArtist(id, 12),
      getReviewsForArtist(id, 8),
      getListenLogsForArtist(id, 10),
    ]);

  const recentListens = await Promise.all(
    recentListensRaw.map(async (log) => {
      try {
        const track = await getOrFetchTrack(log.track_id);
        return { log, trackName: track?.name ?? undefined };
      } catch {
        return { log, trackName: undefined };
      }
    }),
  );

  const image = artist.images?.[0]?.url;

  return (
    <div className="space-y-8">
      {session && spotifyTopTrack ? (
        <RecordRecentView
          kind="artist"
          id={id}
          title={artist.name}
          subtitle={
            artist.genres?.length ? artist.genres.slice(0, 5).join(" · ") : "Artist"
          }
          artworkUrl={image ?? null}
          trackId={spotifyTopTrack.id}
          albumId={spotifyTopTrack.album?.id ?? null}
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
          {session && spotifyTopTrack ? (
            <div className="mt-4">
              <LogListenButton
                trackId={spotifyTopTrack.id}
                albumId={spotifyTopTrack.album?.id ?? null}
                artistId={id}
                displayName={artist.name}
              />
            </div>
          ) : null}
        </div>
      </div>

      {topTracks?.length ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Popular tracks
          </h2>
          <div className="space-y-2">
            {topTracks.slice(0, 10).map((t) => (
              <TrackCard key={t.id} track={t} showAlbum songPageLink />
            ))}
          </div>
        </section>
      ) : null}

      {popularAlbums.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Albums</h2>
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
                    {"★".repeat(Math.min(5, Math.max(1, r.rating)))}
                    {"☆".repeat(5 - Math.min(5, Math.max(1, r.rating)))}
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

      {recentListens.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Recent listens
          </h2>
          <ul className="space-y-2">
            {recentListens.map(({ log, trackName }) => (
              <li key={log.id}>
                <ListenCard log={log} trackName={trackName} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
