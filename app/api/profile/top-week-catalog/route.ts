import { NextRequest } from "next/server";
import {
  apiBadRequest,
  apiOk,
  apiTooManyRequests,
} from "@/lib/api-response";
import { checkSpotifyRateLimit } from "@/lib/rate-limit";
import {
  albumStubMetadataComplete,
  artistDisplayMetadataComplete,
  scheduleAlbumEnrichment,
  scheduleArtistEnrichment,
  scheduleTrackEnrichment,
  trackDisplayMetadataComplete,
} from "@/lib/catalog/non-blocking-enrichment";
import {
  getOrFetchAlbumsBatch,
  getOrFetchArtistsBatch,
  getOrFetchTracksBatch,
} from "@/lib/spotify-cache";
import { isValidUuid } from "@/lib/validation";

const MAX_EACH = 12;
const MAX_TOTAL = 36;
const OPTS = { allowNetwork: false as const };

function uniqUuids(ids: unknown, cap: number): string[] {
  if (!Array.isArray(ids)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of ids) {
    if (typeof x !== "string") continue;
    const s = x.trim();
    if (!isValidUuid(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * POST body: { artistIds?, trackIds?, albumIds? } — canonical UUIDs only.
 * Fills artwork/names from DB-backed catalog cache only; enqueues Spotify hydration when incomplete.
 * Used after the fast server render of “top this week”.
 */
export async function POST(request: NextRequest) {
  if (!checkSpotifyRateLimit(request)) {
    return apiTooManyRequests("Too many requests");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiBadRequest("Invalid JSON");
  }

  const o = (body && typeof body === "object" ? body : {}) as Record<
    string,
    unknown
  >;
  const artistIds = uniqUuids(o.artistIds, MAX_EACH);
  const trackIds = uniqUuids(o.trackIds, MAX_EACH);
  const albumIds = uniqUuids(o.albumIds, MAX_EACH);

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
      const metadata_complete = a ? artistDisplayMetadataComplete(a) : false;
      if (!metadata_complete) scheduleArtistEnrichment(id);
      return {
        id,
        name: a?.name ?? null,
        imageUrl: a?.images?.[0]?.url ?? null,
        metadata_complete,
      };
    }),
    tracks: trackIds.map((id, i) => {
      const t = trackMetaList[i];
      const metadata_complete = t ? trackDisplayMetadataComplete(t) : false;
      if (!metadata_complete) scheduleTrackEnrichment(id);
      return {
        id,
        name: t?.name ?? null,
        artistName: t?.artists?.[0]?.name ?? null,
        albumId: t?.album?.id?.trim() ?? null,
        albumImageUrl: t?.album?.images?.[0]?.url ?? null,
        metadata_complete,
      };
    }),
    albums: albumIds.map((id, i) => {
      const al = albumMetaList[i];
      const metadata_complete = albumStubMetadataComplete(al);
      if (!metadata_complete) scheduleAlbumEnrichment(id);
      return {
        id,
        name: al?.name ?? null,
        artistName: al?.artists?.[0]?.name ?? null,
        imageUrl: al?.images?.[0]?.url ?? null,
        metadata_complete,
      };
    }),
  });
}
