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
import { isValidSpotifyId, isValidUuid } from "@/lib/validation";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const GET = withHandler(async (_request, { user, params }) => {
    const { id } = params;
    if (!isValidSpotifyId(id) && !isValidUuid(id)) return apiBadRequest("Invalid album id");

    const supabase = await createSupabaseServerClient();

    let albumResp: Awaited<ReturnType<typeof getOrFetchAlbum>>;
    try {
      albumResp = await getOrFetchAlbum(id, { allowNetwork: false });
    } catch {
      return apiNotFound("Album not found");
    }

    const { album, tracks, canonicalAlbumId } = albumResp;
    // When UUID is passed, use it as entity ID fallback if canonical lookup returns null
    const entityId = canonicalAlbumId ?? (isValidUuid(id) ? id : null) ?? id;
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

    const reviewsResult = await getReviewsForEntity("album", entityId, 5, user?.id ?? null);
    const reviews =
      reviewsResult?.reviews?.map((r) => ({
        id: r.id,
        username: r.username ?? null,
        rating: r.rating,
        review_text: r.review_text ?? null,
      })) ?? [];

    const review_count = reviewsResult?.count ?? engagement.review_count;

    // Info tab: fetch enrichment data + trigger re-enrichment if stale
    const { data: albumMeta } = await supabase
      .from("albums")
      .select("bio, bio_source, mbid, release_type, credits_enriched_at, bio_enriched_at")
      .eq("id", entityId)
      .maybeSingle();

    const creditsStale =
      !albumMeta?.credits_enriched_at ||
      Date.now() - new Date(albumMeta?.credits_enriched_at as string).getTime() > 365 * 24 * 60 * 60 * 1000;

    if (creditsStale) {
      void import("@/lib/jobs/musicbrainzQueue")
        .then(({ enqueueMusicBrainzEnrich }) =>
          enqueueMusicBrainzEnrich({ name: "enrich_album", albumId: entityId }),
        )
        .catch(() => null);
    }

    const { getAlbumInfoTabData } = await import("@/lib/musicbrainz/db-queries");
    const infoTabData = await getAlbumInfoTabData(supabase, entityId);

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
        const serverStats = trackStats?.[t.id];
        return {
          id: t.id,
          name: t.name,
          track_number: t.track_number ?? idx + 1,
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
      bio: albumMeta?.bio ?? null,
      bio_source: albumMeta?.bio_source ?? null,
      release_type: albumMeta?.release_type ?? null,
      credits_enriched_at: albumMeta?.credits_enriched_at ?? null,
      producers: infoTabData.producers,
      songwriters: infoTabData.songwriters,
      labels: infoTabData.labels,
    });
});

