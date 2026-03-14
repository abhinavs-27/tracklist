import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrFetchArtist } from "@/lib/spotify-cache";
import { TrackCard } from "@/components/track-card";
import { ListenCard } from "@/components/listen-card";
import {
  getTopTracksForArtist,
  getReviewsForArtist,
  getListenLogsForArtist,
  getPopularAlbumsForArtist,
} from "@/lib/queries";
import { getOrFetchTrack } from "@/lib/spotify-cache";

type PageParams = Promise<{ id: string }>;

export default async function ArtistPage({ params }: { params: PageParams }) {
  const { id } = await params;

  let artist: SpotifyApi.ArtistObjectFull;
  try {
    artist = await getOrFetchArtist(id);
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
      {/* Artist header */}
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
        </div>
      </div>

      {/* Popular tracks from logs */}
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

      {/* Popular albums from logs + reviews */}
      {popularAlbums.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Albums</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {popularAlbums.map((a) => (
              <Link
                key={a.id}
                href={`/album/${a.id}`}
                className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 transition hover:border-zinc-600"
              >
                <div className="aspect-square bg-zinc-800">
                  {a.image_url ? (
                    <img
                      src={a.image_url}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl text-zinc-600">
                      ♪
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-medium text-white">
                    {a.name}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {a.listen_count > 0 && (
                      <span>{a.listen_count} listen{a.listen_count !== 1 ? "s" : ""}</span>
                    )}
                    {a.listen_count > 0 && a.review_count > 0 && " · "}
                    {a.review_count > 0 && (
                      <span>{a.review_count} review{a.review_count !== 1 ? "s" : ""}</span>
                    )}
                    {a.listen_count === 0 && a.review_count === 0 && "No activity yet"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Recent reviews */}
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
                    href={r.username ? `/profile/${r.username}` : "#"}
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

      {/* Recent listens */}
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
