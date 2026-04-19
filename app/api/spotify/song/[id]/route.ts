import { NextRequest } from "next/server";
import { apiBadRequest, apiInternalError, apiOk, apiTooManyRequests } from "@/lib/api-response";
import {
  scheduleTrackEnrichment,
  trackDisplayMetadataComplete,
} from "@/lib/catalog/non-blocking-enrichment";
import { getOrFetchTrack } from "@/lib/spotify-cache";
import { checkSpotifyRateLimit } from "@/lib/rate-limit";
import { isValidSpotifyId } from "@/lib/validation";

type RouteParams = Promise<{ id: string }>;

export async function GET(
  request: NextRequest,
  ctx: {
    params: RouteParams;
  },
) {
  if (!checkSpotifyRateLimit(request)) {
    return apiTooManyRequests();
  }

  try {
    const { id } = await ctx.params;
    if (!isValidSpotifyId(id)) return apiBadRequest("Invalid Spotify id");

    const { track } = await getOrFetchTrack(id, { allowNetwork: false });
    const metadata_complete = trackDisplayMetadataComplete(track);
    if (!metadata_complete) {
      scheduleTrackEnrichment(id);
    }

    const album = track.album;
    const artworkImageUrl = album?.images?.[0]?.url ?? null;
    const artist = (track.artists ?? []).map((a) => a.name).filter(Boolean).join(", ");
    const artist_id = (track.artists ?? [])[0]?.id ?? null;
    const release_date = album?.release_date ?? null;

    return apiOk({
      metadata_complete,
      id: track.id,
      name: track.name,
      artist,
      artist_id,
      image_url: artworkImageUrl,
      release_date,
      album_name: album?.name ?? null,
      album_id: album?.id ?? null,
    });
  } catch (e) {
    return apiInternalError(e);
  }
}

