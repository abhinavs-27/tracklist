import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk, apiTooManyRequests } from "@/lib/api-response";
import { getUniqUuids, parseBody } from "@/lib/api-utils";
import { checkSpotifyRateLimit } from "@/lib/rate-limit";
import {
  getOrFetchAlbumsBatch,
  getOrFetchArtistsBatch,
  getOrFetchTracksBatch,
} from "@/lib/spotify-cache";

const MAX_EACH = 12;
const MAX_TOTAL = 36;
const OPTS = { allowNetwork: true as const };

/**
 * POST body: { artistIds?, trackIds?, albumIds? } — canonical UUIDs only.
 * Fills artwork/names from Spotify via catalog cache (may hit network).
 * Used after the fast server render of “top this week”.
 */
export const POST = withHandler(async (request) => {
  if (!checkSpotifyRateLimit(request)) {
    return apiTooManyRequests("Too many requests");
  }

  const { data: body, error: bodyError } = await parseBody<Record<string, unknown>>(request);
  if (bodyError) return bodyError;

  const artistIds = getUniqUuids(body.artistIds, MAX_EACH);
  const trackIds = getUniqUuids(body.trackIds, MAX_EACH);
  const albumIds = getUniqUuids(body.albumIds, MAX_EACH);

  if (artistIds.length + trackIds.length + albumIds.length > MAX_TOTAL) {
    return apiBadRequest("Too many ids");
  }

  if (artistIds.length === 0 && trackIds.length === 0 && albumIds.length === 0) {
    return apiOk({ artists: [], tracks: [], albums: [] });
  }

  const [artistMetaList, trackMetaList, albumMetaList] = await Promise.all([
    artistIds.length
      ? getOrFetchArtistsBatch(artistIds, OPTS)
      : Promise.resolve(
          [] as Awaited<ReturnType<typeof getOrFetchArtistsBatch>>,
        ),
    trackIds.length
      ? getOrFetchTracksBatch(trackIds, OPTS)
      : Promise.resolve(
          [] as Awaited<ReturnType<typeof getOrFetchTracksBatch>>,
        ),
    albumIds.length
      ? getOrFetchAlbumsBatch(albumIds, OPTS)
      : Promise.resolve(
          [] as Awaited<ReturnType<typeof getOrFetchAlbumsBatch>>,
        ),
  ]);

  return apiOk({
    artists: artistIds.map((id, i) => {
      const a = artistMetaList[i];
      return {
        id,
        name: a?.name ?? null,
        imageUrl: a?.images?.[0]?.url ?? null,
      };
    }),
    tracks: trackIds.map((id, i) => {
      const t = trackMetaList[i];
      return {
        id,
        name: t?.name ?? null,
        artistName: t?.artists?.[0]?.name ?? null,
        albumId: t?.album?.id?.trim() ?? null,
        albumImageUrl: t?.album?.images?.[0]?.url ?? null,
      };
    }),
    albums: albumIds.map((id, i) => {
      const al = albumMetaList[i];
      return {
        id,
        name: al?.name ?? null,
        artistName: al?.artists?.[0]?.name ?? null,
        imageUrl: al?.images?.[0]?.url ?? null,
      };
    }),
  });
});
