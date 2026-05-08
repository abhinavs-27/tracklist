import { Router } from "express";
import { badRequest, internalError, notFound, ok } from "../lib/http";
import { getAlbum, getAlbumTracks } from "../lib/spotify";
import { getAlbumEngagementStats, getEntityStats, getTrackStatsForTrackIds } from "../services/statsService";
import { isSupabaseConfigured, getSupabase } from "../lib/supabase";
import { getReviewsForEntity } from "../services/reviewsService";
import { isValidSpotifyId, isValidUuid } from "../lib/validation";
import { resolveCanonicalAlbumUuidFromEntityId } from "../lib/catalogEntityResolution";
import { getSessionUserId } from "../lib/auth";

export const albumsRouter = Router();

// In-process cache — avoids repeated Spotify API calls for the same album.
// TTL 5 minutes matches the mobile app's staleTime.
type CachedAlbum = { data: object; expiresAt: number };
const albumCache = new Map<string, CachedAlbum>();
const ALBUM_TTL_MS = 5 * 60 * 1000;

/**
 * GET /api/albums/:id
 *
 * Accepts both Spotify IDs (22-char alphanumeric) and canonical UUIDs.
 * The mobile app navigates to albums using different ID types depending on
 * the source: Spotify IDs from the explore discovery bundle, UUIDs from the
 * artist page and leaderboard. Rejecting UUIDs caused "Invalid Spotify album id"
 * errors for any album opened from the artist page.
 *
 * Resolution strategy:
 *   UUID  → look up Spotify ID in album_external_ids, then call Spotify API
 *   Spotify ID → call Spotify API directly, resolve UUID for DB queries
 */
albumsRouter.get("/:id", async (req, res) => {
  try {
    const rawId = req.params.id;

    // Serve from cache keyed on the raw ID (both UUID and Spotify ID forms cached)
    const cached = albumCache.get(rawId);
    if (cached && cached.expiresAt > Date.now()) {
      return ok(res, cached.data);
    }

    let spotifyId: string;
    let canonicalId: string | null = null;

    if (isValidSpotifyId(rawId)) {
      spotifyId = rawId;
      // canonicalId resolved below when Supabase is needed
    } else if (isValidUuid(rawId)) {
      canonicalId = rawId;
      if (!isSupabaseConfigured()) return notFound(res, "Album not found");
      const supabase = getSupabase();
      const { data: extRow } = await supabase
        .from("album_external_ids")
        .select("external_id")
        .eq("album_id", rawId)
        .eq("source", "spotify")
        .maybeSingle();
      const sid = (extRow as { external_id?: string } | null)?.external_id;
      if (!sid) return notFound(res, "Album not found");
      spotifyId = sid;
    } else {
      return badRequest(res, "Invalid album id");
    }

    let album: SpotifyApi.AlbumObjectFull;
    let tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
    try {
      album = await getAlbum(spotifyId);
      tracks = await getAlbumTracks(spotifyId, 50, 0);
    } catch {
      return notFound(res, "Album not found");
    }

    const artistNames = (album.artists ?? [])
      .map((a) => a.name)
      .filter(Boolean)
      .join(", ");
    const artist_id = (album.artists ?? [])[0]?.id ?? null;
    const artwork_url = album.images?.[0]?.url ?? null;
    const release_date = album.release_date ?? null;

    let engagement = {
      listen_count: 0,
      review_count: 0,
      avg_rating: null as number | null,
      favorite_count: 0,
    };
    let ratingDistribution: Record<string, number> | null = null;
    let reviewsResult = null;
    let trackStats: Record<
      string,
      { listen_count: number; review_count: number; average_rating: number | null }
    > = {};

    const spotifyTrackIds = (tracks.items ?? []).map((t) => t.id);

    if (isSupabaseConfigured()) {
      const supabase = getSupabase();
      // Resolve canonical UUID for queries that don't do their own resolution
      if (!canonicalId) {
        canonicalId = await resolveCanonicalAlbumUuidFromEntityId(supabase, spotifyId);
      }

      // getAlbumEngagementStats resolves internally — pass either ID format
      // getEntityStats is called separately so we can read rating_distribution
      // (both share an in-memory cache so the second call is free)
      const [engagementResult, entityStatsResult] = await Promise.all([
        getAlbumEngagementStats(spotifyId),
        getEntityStats("album", spotifyId),
      ]);
      engagement = engagementResult;
      ratingDistribution = entityStatsResult.rating_distribution ?? null;

      // Spotify API returns track IDs as Spotify IDs, but track_stats uses DB UUIDs.
      // Resolve Spotify IDs → DB UUIDs so per-track play/review counts are accurate.
      let dbTrackIds = spotifyTrackIds;
      const spotifyToDbId = new Map<string, string>();
      if (spotifyTrackIds.length > 0) {
        const { data: extRows } = await supabase
          .from("track_external_ids")
          .select("track_id, external_id")
          .eq("source", "spotify")
          .in("external_id", spotifyTrackIds);
        for (const row of (extRows ?? []) as { track_id: string; external_id: string }[]) {
          spotifyToDbId.set(row.external_id, row.track_id);
        }
        dbTrackIds = spotifyTrackIds
          .map((sid) => spotifyToDbId.get(sid))
          .filter((id): id is string => !!id);
      }

      const rawTrackStats = await getTrackStatsForTrackIds(dbTrackIds);

      // Re-key stats by Spotify ID so track.id lookups work in the response
      for (const [spotifyId, dbId] of spotifyToDbId.entries()) {
        if (rawTrackStats[dbId]) {
          trackStats[spotifyId] = rawTrackStats[dbId];
        }
      }

      // getReviewsForEntity queries entity_id directly — must use canonical UUID
      if (canonicalId) {
        reviewsResult = await getReviewsForEntity("album", canonicalId, 5, null, null);
      }
    }

    const favorite_count = engagement.favorite_count;
    const reviews =
      reviewsResult?.reviews?.map((r) => ({
        id: r.id,
        username: r.username ?? null,
        rating: r.rating,
        review_text: r.review_text ?? null,
      })) ?? [];
    const review_count = reviewsResult?.count ?? engagement.review_count;

    const payload = {
      album: {
        id: album.id,
        name: album.name,
        artist: artistNames,
        artist_id,
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
        rating_distribution: ratingDistribution,
      },
      reviews: {
        items: reviews,
      },
    };

    albumCache.set(rawId, { data: payload, expiresAt: Date.now() + ALBUM_TTL_MS });
    return ok(res, payload);
  } catch (e) {
    return internalError(res, e);
  }
});

/** GET /api/albums/:id/leaderboard — friend play-count leaderboard for an album. */
albumsRouter.get("/:id/leaderboard", async (req, res) => {
  try {
    const rawId = req.params.id;
    if (!isValidSpotifyId(rawId) && !isValidUuid(rawId)) return ok(res, []);

    const viewerId = await getSessionUserId(req).catch(() => null);
    if (!viewerId || !isSupabaseConfigured()) return ok(res, []);

    const supabase = getSupabase();

    // Resolve to canonical album UUID
    let canonicalAlbumId: string | null = null;
    if (isValidUuid(rawId)) {
      canonicalAlbumId = rawId;
    } else {
      const { data } = await supabase
        .from("album_external_ids")
        .select("album_id")
        .eq("external_id", rawId)
        .eq("source", "spotify")
        .maybeSingle();
      canonicalAlbumId = (data as { album_id?: string } | null)?.album_id ?? null;
    }
    if (!canonicalAlbumId) return ok(res, []);

    // Get tracks for this album
    const { data: trackRows } = await supabase
      .from("tracks").select("id").eq("album_id", canonicalAlbumId).limit(500);
    const trackIds = ((trackRows ?? []) as { id: string }[]).map((t) => t.id);
    if (!trackIds.length) return ok(res, []);

    // Get viewer + their follows
    const { data: follows } = await supabase
      .from("follows").select("following_id").eq("follower_id", viewerId).limit(200);
    const friendIds = [viewerId, ...((follows ?? []) as { following_id: string }[]).map((f) => f.following_id)];

    // Count plays per user across album tracks
    const playCounts = new Map<string, number>();
    const CHUNK = 200;
    for (let i = 0; i < trackIds.length; i += CHUNK) {
      const chunk = trackIds.slice(i, i + CHUNK);
      const { data: logs } = await supabase
        .from("logs").select("user_id")
        .in("user_id", friendIds).in("track_id", chunk).limit(50000);
      for (const row of (logs ?? []) as { user_id: string }[]) {
        playCounts.set(row.user_id, (playCounts.get(row.user_id) ?? 0) + 1);
      }
    }

    if (playCounts.size < 2) return ok(res, []);

    const userIds = [...playCounts.keys()];
    const { data: users } = await supabase
      .from("users").select("id, username, avatar_url").in("id", userIds);
    const userMap = new Map(
      ((users ?? []) as { id: string; username: string; avatar_url: string | null }[])
        .map((u) => [u.id, u]),
    );

    const entries = [...playCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([uid, count]) => {
        const u = userMap.get(uid);
        return {
          userId: uid,
          username: u?.username ?? "Unknown",
          avatarUrl: u?.avatar_url ?? null,
          playCount: count,
          isViewer: uid === viewerId,
        };
      });

    return ok(res, entries);
  } catch (e) {
    return internalError(res, e);
  }
});
