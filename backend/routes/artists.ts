import { Router } from "express";
import { badRequest, internalError, notFound, ok } from "../lib/http";
import { getTrackStatsForTrackIds } from "../services/statsService";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { getSessionUserId } from "../lib/auth";
import { isValidSpotifyId, isValidUuid } from "../lib/validation";
import { resolveCanonicalArtistUuidFromEntityId } from "../lib/catalogEntityResolution";
import {
  fetchArtistAlbumsFromDb,
  fetchArtistTracksFromDb,
  fetchArtistViewerStats,
  fetchArtistRecentListens,
  fetchArtistReviewsSimple,
  fetchArtistFriendLeaderboard,
} from "../lib/artist-db-feed";

export const artistsRouter = Router();

/**
 * GET /api/artists/:id
 * DB-first — no Spotify API calls. Accepts Spotify IDs and canonical UUIDs.
 */
artistsRouter.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || (!isValidSpotifyId(id) && !isValidUuid(id))) {
      return badRequest(res, "Invalid artist id");
    }
    if (!isSupabaseConfigured()) return notFound(res, "Artist not found");

    const supabase = getSupabase();
    const viewerId = await getSessionUserId(req).catch(() => null);

    const canonicalId = await resolveCanonicalArtistUuidFromEntityId(supabase, id);
    if (!canonicalId) return notFound(res, "Artist not found");

    const { data: artistRow } = await supabase
      .from("artists")
      .select("id, name, image_url, genres, popularity")
      .eq("id", canonicalId)
      .maybeSingle();
    if (!artistRow) return notFound(res, "Artist not found");

    const [dbAlbums, dbTracks, dbReviews] = await Promise.all([
      fetchArtistAlbumsFromDb(supabase, canonicalId, artistRow.name, 12),
      fetchArtistTracksFromDb(supabase, canonicalId, 10),
      fetchArtistReviewsSimple(supabase, canonicalId, 6),
    ]);

    // Build artwork map from fetched albums
    const albumArtworkMap = new Map<string, string | null>(
      (dbAlbums as { id: string; artwork_url?: string | null }[]).map((a) => [a.id, a.artwork_url ?? null]),
    );

    // Ensure every track's album is in the artwork map — fetch any missing ones.
    // Mirrors getTopTracksForArtist on web which fetches all track album artwork independently.
    const missingAlbumIds = (dbTracks as { album_id: string | null }[])
      .map((t) => t.album_id)
      .filter((id): id is string => !!id && !albumArtworkMap.has(id));
    if (missingAlbumIds.length > 0) {
      const { data: extraAlbums } = await supabase
        .from("albums")
        .select("id, image_url")
        .in("id", [...new Set(missingAlbumIds)]);
      for (const a of (extraAlbums ?? []) as { id: string; image_url: string | null }[]) {
        albumArtworkMap.set(a.id, a.image_url ?? null);
      }
    }

    // Community stats derived from albums
    const totalCommunityPlays = (dbAlbums as { listen_count?: number }[]).reduce(
      (s, a) => s + (a.listen_count ?? 0), 0,
    );
    const ratedAlbums = (dbAlbums as { average_rating?: number | null }[]).filter(
      (a) => a.average_rating != null,
    );
    const avgRating =
      ratedAlbums.length > 0
        ? ratedAlbums.reduce((s, a) => s + (a.average_rating ?? 0), 0) / ratedAlbums.length
        : null;

    let totalPlays = 0;
    let topTracks: Array<{
      id: string; name: string; track_number: number; duration_ms: number | null;
      listen_count: number; review_count: number; average_rating: number | null;
      artwork_url: string | null;
    }> = [];

    if (dbTracks.length > 0) {
      const topTrackIds = dbTracks.map((t) => t.id);
      const trackStats = topTrackIds.length > 0 ? await getTrackStatsForTrackIds(topTrackIds) : {};
      topTracks = dbTracks.map((t, idx) => {
        const s = trackStats[t.id];
        const listen = s?.listen_count ?? 0;
        totalPlays += listen;
        return {
          id: t.id, name: t.name, track_number: idx + 1, duration_ms: t.duration_ms,
          listen_count: listen, review_count: s?.review_count ?? 0,
          average_rating: s?.average_rating ?? null,
          artwork_url: t.album_id ? (albumArtworkMap.get(t.album_id) ?? null) : null,
        };
      });
    }

    return ok(res, {
      artist: {
        id: artistRow.id,
        name: artistRow.name,
        image_url: artistRow.image_url ?? null,
        followers: null,
        genres: ((artistRow.genres as string[] | null) ?? []).slice(0, 4),
      },
      albums: dbAlbums,
      topTracks,
      stats: {
        average_rating: avgRating,
        play_count: totalCommunityPlays,
        favorite_count: 0,
        review_count: 0,
      },
      communityStats: {
        totalPlays: totalCommunityPlays,
        avgRating,
        albumCount: dbAlbums.length,
      },
      reviews: dbReviews,
    });
  } catch (e) {
    return internalError(res, e);
  }
});

/** GET /api/artists/:id/leaderboard — friend play-count leaderboard */
artistsRouter.get("/:id/leaderboard", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || (!isValidSpotifyId(id) && !isValidUuid(id))) return badRequest(res, "Invalid artist id");
    const viewerId = await getSessionUserId(req).catch(() => null);
    if (!viewerId) return ok(res, []);
    if (!isSupabaseConfigured()) return ok(res, []);

    const supabase = getSupabase();
    const canonicalId = await resolveCanonicalArtistUuidFromEntityId(supabase, id);
    if (!canonicalId) return ok(res, []);

    const entries = await fetchArtistFriendLeaderboard(supabase, viewerId, canonicalId);
    return ok(res, entries);
  } catch (e) {
    return internalError(res, e);
  }
});

/** GET /api/artists/:id/viewer-stats — lazy-loaded personal stats */
artistsRouter.get("/:id/viewer-stats", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || (!isValidSpotifyId(id) && !isValidUuid(id))) return badRequest(res, "Invalid artist id");
    const viewerId = await getSessionUserId(req).catch(() => null);
    if (!viewerId) return ok(res, null);
    if (!isSupabaseConfigured()) return ok(res, null);

    const supabase = getSupabase();
    const canonicalId = await resolveCanonicalArtistUuidFromEntityId(supabase, id);
    if (!canonicalId) return ok(res, null);

    const stats = await fetchArtistViewerStats(supabase, viewerId, canonicalId);
    return ok(res, stats);
  } catch (e) {
    return internalError(res, e);
  }
});

/** GET /api/artists/:id/albums — full album discography */
artistsRouter.get("/:id/albums", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || (!isValidSpotifyId(id) && !isValidUuid(id))) return badRequest(res, "Invalid artist id");
    if (!isSupabaseConfigured()) return ok(res, { artistName: "", artistImageUrl: null, albums: [] });

    const supabase = getSupabase();
    const canonicalId = await resolveCanonicalArtistUuidFromEntityId(supabase, id);
    if (!canonicalId) return notFound(res, "Artist not found");

    const { data: artistRow } = await supabase
      .from("artists")
      .select("id, name, image_url")
      .eq("id", canonicalId)
      .maybeSingle();
    if (!artistRow) return notFound(res, "Artist not found");

    const albums = await fetchArtistAlbumsFromDb(supabase, canonicalId, artistRow.name, 500);
    return ok(res, {
      artistName: artistRow.name as string,
      artistImageUrl: (artistRow.image_url as string | null) ?? null,
      albums,
    });
  } catch (e) {
    return internalError(res, e);
  }
});

/** GET /api/artists/:id/recent-listens */
artistsRouter.get("/:id/recent-listens", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || (!isValidSpotifyId(id) && !isValidUuid(id))) return badRequest(res, "Invalid artist id");
    if (!isSupabaseConfigured()) return ok(res, []);

    const supabase = getSupabase();
    const viewerId = await getSessionUserId(req).catch(() => null);
    const canonicalId = await resolveCanonicalArtistUuidFromEntityId(supabase, id);
    if (!canonicalId) return ok(res, []);

    const listens = await fetchArtistRecentListens(supabase, canonicalId, viewerId);
    return ok(res, listens);
  } catch (e) {
    return internalError(res, e);
  }
});
