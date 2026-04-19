import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiNotFound, apiOk } from "@/lib/api-response";
import {
  albumDisplayMetadataComplete,
  scheduleAlbumEnrichment,
} from "@/lib/catalog/non-blocking-enrichment";
import { getOrFetchAlbum } from "@/lib/spotify-cache";
import {
  getAlbumEngagementStats,
  getReviewsForEntity,
  getTrackStatsForTrackIds,
} from "@/lib/queries";
import { isValidSpotifyId } from "@/lib/validation";

export const GET = withHandler(async (_request, { params }) => {
    const { id } = params;
    if (!isValidSpotifyId(id)) return apiBadRequest("Invalid Spotify album id");

    let albumResp: Awaited<ReturnType<typeof getOrFetchAlbum>>;
    try {
      albumResp = await getOrFetchAlbum(id, { allowNetwork: false });
    } catch {
      return apiNotFound("Album not found");
    }

    const { album, tracks, canonicalAlbumId } = albumResp;
    const entityId = canonicalAlbumId ?? id;
    const metadata_complete = albumDisplayMetadataComplete(album, tracks);
    if (!metadata_complete) {
      scheduleAlbumEnrichment(id);
    }

    const artistNames = (album.artists ?? []).map((a) => a.name).filter(Boolean).join(", ");
    const artist_id = (album.artists ?? [])[0]?.id ?? null;
    const artwork_url = album.images?.[0]?.url ?? null;
    const release_date = album.release_date ?? null;

    const engagement = await getAlbumEngagementStats(entityId);

    const trackIds = (tracks.items ?? []).map((t) => t.id);
    const trackStats = await getTrackStatsForTrackIds(trackIds);

    const favorite_count = engagement.favorite_count;

    const reviewsResult = await getReviewsForEntity("album", entityId, 5);
    const reviews =
      reviewsResult?.reviews?.map((r) => ({
        id: r.id,
        username: r.username ?? null,
        rating: r.rating,
        review_text: r.review_text ?? null,
      })) ?? [];

    const review_count = reviewsResult?.count ?? engagement.review_count;

    return apiOk({
      metadata_complete,
      album: {
        id: album.id,
        name: album.name,
        artist: artistNames,
        artist_id,
        artwork_url,
        release_date,
      },
      tracks: (tracks.items ?? []).map((t, idx) => {
        // Spotify types for TrackObjectSimplified don't always expose track_number,
        // but the field is present in the payload. Fallback to index+1 for safety.
        const maybeTrackNumber = (t as unknown as { track_number?: number }).track_number;
        const serverStats = trackStats?.[t.id];
        return {
          id: t.id,
          name: t.name,
          track_number: maybeTrackNumber ?? idx + 1,
          duration_ms: t.duration_ms ?? null,
          listen_count: serverStats?.listen_count ?? 0,
          review_count: serverStats?.review_count ?? 0,
          average_rating: serverStats?.average_rating ?? null,
        };
      }),
      stats: {
        average_rating: engagement.avg_rating,
        play_count: engagement.listen_count,
        favorite_count,
        review_count,
      },
      reviews: {
        items: reviews,
      },
    });
});

