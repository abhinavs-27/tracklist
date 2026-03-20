import { Router } from "express";
import { badRequest, internalError, notFound, ok } from "../lib/http";
import { getAlbum, getAlbumTracks } from "../lib/spotify";
import { getAlbumEngagementStats, getTrackStatsForTrackIds } from "../services/statsService";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { getReviewsForEntity } from "../services/reviewsService";
import { isValidSpotifyId } from "../lib/validation";

export const albumsRouter = Router();

albumsRouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidSpotifyId(id)) return badRequest(res, "Invalid Spotify album id");

    let album: SpotifyApi.AlbumObjectFull;
    let tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
    try {
      album = await getAlbum(id);
      tracks = await getAlbumTracks(id, 50, 0);
    } catch {
      return notFound(res, "Album not found");
    }

    const artistNames = (album.artists ?? [])
      .map((a) => a.name)
      .filter(Boolean)
      .join(", ");
    const artwork_url = album.images?.[0]?.url ?? null;
    const release_date = album.release_date ?? null;

    let engagement = {
      listen_count: 0,
      review_count: 0,
      avg_rating: null as number | null,
    };
    let favorite_count = 0;
    let reviewsResult = null;
    let trackStats: Record<
      string,
      { listen_count: number; review_count: number; average_rating: number | null }
    > = {};

    const trackIds = (tracks.items ?? []).map((t) => t.id);

    if (isSupabaseConfigured()) {
      engagement = await getAlbumEngagementStats(id);
      trackStats = await getTrackStatsForTrackIds(trackIds);

      const supabase = getSupabase();
      const { data: entityStatRow } = await supabase
        .from("entity_stats")
        .select("favorite_count")
        .eq("entity_type", "album")
        .eq("entity_id", id)
        .maybeSingle();

      favorite_count = entityStatRow?.favorite_count ?? 0;

      reviewsResult = await getReviewsForEntity("album", id, 5, null, null);
    }

    const reviews =
      reviewsResult?.reviews?.map((r) => ({
        id: r.id,
        username: r.username ?? null,
        rating: r.rating,
        review_text: r.review_text ?? null,
      })) ?? [];

    const review_count = reviewsResult?.count ?? engagement.review_count;

    return ok(res, {
      album: {
        id: album.id,
        name: album.name,
        artist: artistNames,
        artwork_url,
        release_date,
      },
      tracks: (tracks.items ?? []).map((t, idx) => {
        const maybeTrackNumber = (t as unknown as { track_number?: number })
          .track_number;
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
  } catch (e) {
    return internalError(res, e);
  }
});
