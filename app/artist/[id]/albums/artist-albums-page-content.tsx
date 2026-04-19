import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrCreateEntity } from "@/lib/catalog/getOrCreateEntity";
import { redirectToCanonicalEntityIfNeeded } from "@/lib/catalog/redirect-to-canonical-entity-route";
import { getOrFetchArtist } from "@/lib/spotify-cache";
import { MediaGrid, type MediaItem } from "@/components/media/MediaGrid";
import { getArtistAlbumsWithEngagement } from "@/lib/queries";
import {
  isUUID,
  isValidSpotifyId,
  normalizeReviewEntityId,
} from "@/lib/validation";

type PageParams = Promise<{ id: string }>;

export async function ArtistAlbumsPageContent({
  params,
}: {
  params: PageParams;
}) {
  const { id: rawId } = await params;
  const id = normalizeReviewEntityId(rawId);

  if (!isUUID(id) && isValidSpotifyId(id)) {
    const result = await getOrCreateEntity({
      type: "artist",
      spotifyId: id,
      allowNetwork: true,
    });
    redirect(`/artist/${result.id}/albums`);
  }

  let artist: SpotifyApi.ArtistObjectFull;
  let entityId = id;
  let canonicalArtistId: string | null = null;
  try {
    const fetched = await getOrFetchArtist(id, { allowNetwork: false });
    artist = fetched.artist;
    canonicalArtistId = fetched.canonicalArtistId;
    entityId = fetched.canonicalArtistId ?? id;
  } catch {
    notFound();
  }
  redirectToCanonicalEntityIfNeeded("artist", id, canonicalArtistId);

  const albums = await getArtistAlbumsWithEngagement(entityId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link
          href={`/artist/${entityId}`}
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
          No albums in the catalog yet. Discography sync runs in the background.
        </p>
      )}
    </div>
  );
}
