import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getOrFetchAlbum } from "@/lib/spotify-cache";
import { AlbumLogButton } from "@/app/album/[id]/album-log-button";
import { LogCard } from "@/components/log-card";
import { TrackCard } from "@/components/track-card";
import { EntityReviewsSection } from "@/components/entity-reviews-section";
import type { LogWithUser } from "@/types";
import type { ReviewsResponse } from "@/components/entity-reviews-section";

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

async function getReviewsForEntity(
  entityType: "album" | "song",
  entityId: string
): Promise<ReviewsResponse | null> {
  const base = process.env.NEXTAUTH_URL || "http://127.0.0.1:3000";
  const res = await fetch(
    `${base}/api/reviews?entity_type=${entityType}&entity_id=${encodeURIComponent(entityId)}&limit=20`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  return res.json();
}

type PageParams = Promise<{ id: string }>;

export default async function AlbumPage({ params }: { params: PageParams }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  let album: SpotifyApi.AlbumObjectFull;
  let tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
  try {
    const data = await getOrFetchAlbum(id);
    album = data.album;
    tracks = data.tracks;
  } catch {
    notFound();
  }

  const [logs, reviewsData] = await Promise.all([
    getLogsForSpotify(id),
    getReviewsForEntity("album", id),
  ]);
  const image = album.images?.[0]?.url;

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
                  <TrackCard track={t} showAlbum={false} songPageLink />
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

      <EntityReviewsSection
        entityType="album"
        entityId={id}
        spotifyName={album.name}
        initialData={reviewsData}
      />

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
