import { getRisingArtistsCached } from "@/lib/discover-cache";
import { getOrFetchArtistsBatch } from "@/lib/spotify-cache";
import { RisingArtistsSection } from "./rising-artists-section";

const MAX_ITEMS = 20;
const DISCOVER_CATALOG_OPTS = {
  allowNetwork: process.env.SPOTIFY_REFRESH_DISABLED !== "true",
} as const;

export async function RisingArtistsLoader() {
  const risingArtists = await getRisingArtistsCached(MAX_ITEMS, 7);
  const risingArtistIds = risingArtists.map((a) => a.artist_id);

  const artistArr = risingArtistIds.length > 0
    ? await getOrFetchArtistsBatch(risingArtistIds, DISCOVER_CATALOG_OPTS)
    : [];

  const artistImageMap = new Map<string, string | null>();
  artistArr.forEach((a, i) => {
    if (a?.images?.[0]?.url && risingArtistIds[i]) {
      artistImageMap.set(risingArtistIds[i], a.images[0].url);
    }
  });

  const risingArtistsWithImages = risingArtists.map((a) => ({
    ...a,
    avatar_url: artistImageMap.get(a.artist_id) ?? a.avatar_url,
  }));

  return <RisingArtistsSection artists={risingArtistsWithImages} />;
}
