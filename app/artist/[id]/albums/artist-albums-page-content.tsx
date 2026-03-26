import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrFetchArtist } from "@/lib/spotify-cache";
import { MediaGrid, type MediaItem } from "@/components/media/MediaGrid";
import { getArtistAlbumsWithEngagement } from "@/lib/queries";

type PageParams = Promise<{ id: string }>;

export async function ArtistAlbumsPageContent({
  params,
}: {
  params: PageParams;
}) {
  const { id } = await params;

  let artist: SpotifyApi.ArtistObjectFull;
  try {
    artist = await getOrFetchArtist(id);
  } catch {
    notFound();
  }

  const albums = await getArtistAlbumsWithEngagement(id);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href={`/artist/${id}`}
          className="text-zinc-400 hover:text-white hover:underline"
        >
          ← {artist.name}
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white">Albums</h1>
        <p className="mt-1 text-sm text-zinc-500">{artist.name}</p>
      </div>

      {albums.length > 0 ? (
        <MediaGrid
          items={albums.map(
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
      ) : (
        <p className="text-sm text-zinc-500">
          No albums found for this artist on Spotify.
        </p>
      )}
    </div>
  );
}
