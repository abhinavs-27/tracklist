import Link from "next/link";
import { getPopularAlbumsForArtist } from "@/lib/queries";
import { MediaGrid, type MediaItem } from "@/components/media/MediaGrid";

export async function ArtistAlbumsSection({
  artistId,
  artistName,
}: {
  artistId: string;
  artistName: string;
}) {
  const popularAlbumsResult = await getPopularAlbumsForArtist(artistId);
  const popularAlbums = popularAlbumsResult.rows;
  const showAlbumsViewMore = popularAlbumsResult.hasMoreAlbums;

  if (popularAlbums.length === 0) {
    return null;
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-semibold text-white">Albums</h2>
        {showAlbumsViewMore ? (
          <Link
            href={`/artist/${artistId}/albums`}
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
            artist: artistName,
            artworkUrl: a.image_url ?? null,
            avgRating: a.average_rating ?? undefined,
            totalPlays: a.listen_count,
          }),
        )}
        columns={4}
      />
    </section>
  );
}
