import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getOrFetchTrack } from "@/lib/spotify-cache";
import { AlbumLogButton } from "@/app/album/[id]/album-log-button";
import { EntityReviewsSection } from "@/components/entity-reviews-section";
import { getReviewsForEntity } from "@/lib/queries";

type PageParams = Promise<{ id: string }>;

export default async function SongPage({ params }: { params: PageParams }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  let track: SpotifyApi.TrackObjectFull;
  try {
    track = await getOrFetchTrack(id);
  } catch {
    notFound();
  }

  const [reviewsData] = await Promise.all([
    getReviewsForEntity("song", id),
  ]);
  const album = track.album;
  const image = album?.images?.[0]?.url;
  const artistNames = track.artists?.map((a) => a.name).join(", ") ?? "";

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
          <h1 className="text-3xl font-bold text-white">{track.name}</h1>
          <p className="mt-1 text-zinc-400">
            {track.artists?.map((a, i) => (
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
          {album && (
            <p className="mt-1 text-sm text-zinc-500">
              <Link
                href={`/album/${album.id}`}
                className="hover:text-emerald-400 hover:underline"
              >
                {album.name}
              </Link>
            </p>
          )}
          {session && (
            <div className="mt-4">
              <AlbumLogButton
                spotifyId={id}
                type="song"
                spotifyName={track.name}
              />
            </div>
          )}
        </div>
      </div>

      <EntityReviewsSection
        entityType="song"
        entityId={id}
        spotifyName={track.name}
        initialData={reviewsData}
      />
    </div>
  );
}
