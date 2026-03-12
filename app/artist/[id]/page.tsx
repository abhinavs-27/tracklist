import Link from "next/link";
import { notFound } from "next/navigation";
import { getArtist, getArtistAlbums, getArtistTopTracks } from "@/lib/spotify";
import { ArtistCard } from "@/components/artist-card";
import { AlbumCard } from "@/components/album-card";
import { TrackCard } from "@/components/track-card";
import { LogCard } from "@/components/log-card";
import type { LogWithUser } from "@/types";

async function getLogsForSpotify(spotifyId: string): Promise<LogWithUser[]> {
  const base = process.env.NEXTAUTH_URL || "http://127.0.0.1:3000";
  const res = await fetch(
    `${base}/api/logs?spotify_id=${encodeURIComponent(spotifyId)}&limit=20`,
    {
      cache: "no-store",
    },
  );
  if (!res.ok) return [];
  return res.json();
}

type PageParams = {
  id: string;
};

export default async function ArtistPage({ params }: { params: PageParams }) {
  const { id } = params;

  let artist;
  let albums;
  let topTracks;
  try {
    [artist, albums, topTracks] = await Promise.all([
      getArtist(id),
      getArtistAlbums(id, 12),
      getArtistTopTracks(id),
    ]);
  } catch {
    notFound();
  }

  const logs = await getLogsForSpotify(id);
  const image = artist.images?.[0]?.url;

  return (
    <div className="space-y-8">
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
          {artist.followers != null && (
            <p className="mt-1 text-sm text-zinc-500">
              {artist.followers.total.toLocaleString()} followers on Spotify
            </p>
          )}
        </div>
      </div>

      {topTracks.tracks?.length ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Popular tracks
          </h2>
          <div className="space-y-2">
            {topTracks.tracks.slice(0, 10).map((t) => (
              <TrackCard key={t.id} track={t} showAlbum={true} />
            ))}
          </div>
        </section>
      ) : null}

      {albums.items?.length ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Albums</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {albums.items.map((a) => (
              <AlbumCard key={a.id} album={a} />
            ))}
          </div>
        </section>
      ) : null}

      {logs.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Community logs
          </h2>
          <p className="mb-2 text-sm text-zinc-500">
            Logs for this artist (albums/tracks).
          </p>
          <ul className="space-y-4">
            {logs.map((log) => (
              <li key={log.id}>
                <LogCard
                  log={log}
                  spotifyName={log.title ?? undefined}
                  showComments={true}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
