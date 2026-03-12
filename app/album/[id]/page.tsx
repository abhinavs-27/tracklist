import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getAlbum, getAlbumTracks } from "@/lib/spotify";
import { AlbumLogButton } from "./album-log-button";
import { LogCard } from "@/components/log-card";
import { TrackCard } from "@/components/track-card";
import type { LogWithUser } from "@/types";

async function getLogsForSpotify(spotifyId: string): Promise<LogWithUser[]> {
  const base = process.env.NEXTAUTH_URL || "http://127.0.0.1:3000";
  const res = await fetch(
    `${base}/api/logs?spotify_id=${encodeURIComponent(spotifyId)}&limit=30`,
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

export default async function AlbumPage({ params }: { params: PageParams }) {
  const { id } = params;
  const session = await getServerSession(authOptions);

  let album;
  let tracks;
  try {
    [album, tracks] = await Promise.all([getAlbum(id), getAlbumTracks(id)]);
  } catch {
    notFound();
  }

  const logs = await getLogsForSpotify(id);
  const image = album.images?.[0]?.url;
  const artistNames = album.artists?.map((a) => a.name).join(", ") ?? "";

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
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold text-white">{album.name}</h1>
          <p className="mt-1 text-zinc-400">
            {album.artists?.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ", "}
                <Link
                  href={`/artist/${a.id}`}
                  className="hover:text-emerald-400 hover:underline"
                >
                  {a.name}
                </Link>
              </span>
            ))}
          </p>
          {album.release_date && (
            <p className="mt-1 text-sm text-zinc-500">
              {new Date(album.release_date).getFullYear()}
            </p>
          )}
          {session && (
            <div className="mt-4">
              <AlbumLogButton
                spotifyId={id}
                type="album"
                spotifyName={album.name}
              />
            </div>
          )}
        </div>
      </div>

      {tracks.items?.length ? (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">Tracks</h2>
          <div className="space-y-2">
            {tracks.items.map((t) => (
              <div key={t.id} className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <TrackCard track={t} showAlbum={false} noLink />
                </div>
                {session && (
                  <AlbumLogButton
                    spotifyId={t.id}
                    type="song"
                    spotifyName={t.name}
                    className="shrink-0"
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {logs.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-white">
            Community logs
          </h2>
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
