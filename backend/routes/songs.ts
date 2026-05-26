import { Router } from "express";
import { badRequest, internalError, notFound, ok } from "../lib/http";
import { getSessionUserId } from "../lib/auth";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { isValidSpotifyId, isValidUuid } from "../lib/validation";
import { resolveCanonicalTrackUuidFromEntityId } from "../lib/catalogEntityResolution";
import { getEntityStats, getTrackStatsForTrackIds } from "../services/statsService";

import { getReviewsForEntity } from "../services/reviewsService";

export const songsRouter = Router();

/** GET /api/songs/:id/info — credits-only info tab data for mobile. Accepts Spotify IDs and canonical UUIDs. */
songsRouter.get("/:id/info", async (req, res) => {
  try {
    const rawId = req.params.id;
    if (!rawId || (!isValidSpotifyId(rawId) && !isValidUuid(rawId))) {
      return badRequest(res, "Invalid song id");
    }
    if (!isSupabaseConfigured()) return notFound(res, "Song not found");

    const supabase = getSupabase();
    const canonicalId = await resolveCanonicalTrackUuidFromEntityId(supabase, rawId);
    if (!canonicalId) return notFound(res, "Song not found");

    const [producersResult, songwritersResult, featResult] = await Promise.all([
      supabase.from("song_producers").select("artists(id, name)").eq("song_id", canonicalId),
      supabase.from("song_songwriters").select("artists(id, name)").eq("song_id", canonicalId),
      supabase.from("track_featuring_artists").select("artists(id, name)").eq("track_id", canonicalId),
    ]);

    const producers = (producersResult.data ?? []).map((r: any) => r.artists).filter(Boolean);
    const songwriters = (songwritersResult.data ?? []).map((r: any) => r.artists).filter(Boolean);
    const featuring = (featResult.data ?? []).map((r: any) => r.artists).filter(Boolean);

    return ok(res, { producers, songwriters, featuring });
  } catch (e) {
    return internalError(res, e);
  }
});

/** GET /api/songs/:id — track detail for mobile. Accepts Spotify IDs and canonical UUIDs. */
songsRouter.get("/:id", async (req, res) => {
  try {
    const rawId = req.params.id;
    if (!rawId || (!isValidSpotifyId(rawId) && !isValidUuid(rawId))) {
      return badRequest(res, "Invalid song id");
    }
    if (!isSupabaseConfigured()) return notFound(res, "Song not found");

    const supabase = getSupabase();
    const viewerId = await getSessionUserId(req).catch(() => null);

    const canonicalId = await resolveCanonicalTrackUuidFromEntityId(supabase, rawId);
    if (!canonicalId) return notFound(res, "Song not found");

    // Fetch track row + join album + join artist
    // Fetch track, album, external IDs in parallel
    const [trackRowResult, extIdResult] = await Promise.all([
      supabase.from("tracks").select("id, name, duration_ms, track_number, album_id").eq("id", canonicalId).maybeSingle(),
      supabase.from("track_external_ids").select("external_id, source").eq("track_id", canonicalId),
    ]);

    const trackRow = trackRowResult.data;
    if (!trackRow) return notFound(res, "Song not found");

    const extIds = extIdResult.data ?? [];
    const spotifyId = extIds.find((e: any) => e.source === "spotify")?.external_id ?? null;

    // Fetch album and artist
    let album: any = null;
    let artist = { name: "", id: null as string | null };
    if ((trackRow as any).album_id) {
      const { data: albumRow } = await supabase
        .from("albums")
        .select("id, name, image_url, release_date, artist_id")
        .eq("id", (trackRow as any).album_id)
        .maybeSingle();
      album = albumRow;
      if (albumRow?.artist_id) {
        const { data: artistRow } = await supabase
          .from("artists")
          .select("id, name")
          .eq("id", albumRow.artist_id)
          .maybeSingle();
        artist = { name: (artistRow as any)?.name ?? "", id: (artistRow as any)?.id ?? null };
      }
    }

    const albumId = (trackRow as any).album_id ?? null;

    const [statsResult, reviewsResult, recentListensData, recommendedData] = await Promise.all([
      getEntityStats("song", canonicalId),
      getReviewsForEntity("song", canonicalId, 5, viewerId, null),
      // Recent listens: last 10 unique users who played this track
      (async () => {
        const { data: logs } = await supabase
          .from("logs")
          .select("user_id, listened_at")
          .eq("track_id", canonicalId)
          .order("listened_at", { ascending: false })
          .limit(50);
        if (!logs?.length) return [];
        const seen = new Set<string>();
        const unique = (logs as { user_id: string; listened_at: string }[])
          .filter(l => { if (seen.has(l.user_id)) return false; seen.add(l.user_id); return true; })
          .slice(0, 10);
        const userIds = unique.map(l => l.user_id);
        const { data: users } = await supabase.from("users").select("id, username, avatar_url").in("id", userIds);
        const userMap = new Map(((users ?? []) as { id: string; username: string; avatar_url: string | null }[]).map(u => [u.id, u]));
        return unique.map(l => {
          const u = userMap.get(l.user_id);
          if (!u) return null;
          return { user_id: l.user_id, username: u.username, avatar_url: u.avatar_url ?? null, listened_at: l.listened_at };
        }).filter(Boolean);
      })(),
      // Recommended: co-occurrence based (same table as web's getRelatedMedia)
      (async () => {
        const { data: coRows } = await supabase
          .from("media_cooccurrence")
          .select("related_content_id, score")
          .eq("content_type", "song")
          .eq("content_id", canonicalId)
          .order("score", { ascending: false })
          .limit(12);
        if (!coRows?.length) return [];

        const relatedIds = coRows.map((r: any) => r.related_content_id as string);

        // Fetch track details + album art for each related track
        const { data: relatedTracks } = await supabase
          .from("tracks")
          .select("id, name, album_id, track_external_ids(external_id, source)")
          .in("id", relatedIds);
        if (!relatedTracks?.length) return [];

        const albumIds = [...new Set(relatedTracks.map((t: any) => t.album_id).filter(Boolean))];
        const { data: albumRows } = albumIds.length
          ? await supabase.from("albums").select("id, name, image_url, artist_id").in("id", albumIds)
          : { data: [] };
        const albumMap = new Map(((albumRows ?? []) as any[]).map((a) => [a.id, a]));

        const artistIds = [...new Set((albumRows ?? []).map((a: any) => a.artist_id).filter(Boolean))];
        const { data: artistRows } = artistIds.length
          ? await supabase.from("artists").select("id, name").in("id", artistIds)
          : { data: [] };
        const artistMap = new Map(((artistRows ?? []) as any[]).map((a) => [a.id, a]));

        // Preserve co-occurrence order
        const trackMap = new Map(relatedTracks.map((t: any) => [t.id, t]));
        return relatedIds
          .map((id) => {
            const t = trackMap.get(id);
            if (!t) return null;
            const alb = albumMap.get(t.album_id);
            const art = artistMap.get(alb?.artist_id);
            const spotifyId = ((t.track_external_ids ?? []) as any[]).find((e) => e.source === "spotify")?.external_id ?? null;
            return {
              id: spotifyId ?? t.id,
              canonical_id: t.id,
              name: t.name,
              artist: art?.name ?? "",
              image_url: alb?.image_url ?? null,
              album_name: alb?.name ?? null,
              album_id: alb?.id ?? null,
              listen_count: 0,
              average_rating: null,
            };
          })
          .filter(Boolean);
      })(),
    ]);

    // Info tab data — credits, samples, covers
    const [
      producersResult,
      songwritersResult,
      featResult,
      samplesResult,
      sampledByResult,
      coversResult,
      creditsMetaResult,
    ] = await Promise.all([
      supabase.from("song_producers").select("artists(id, name, mbid)").eq("song_id", canonicalId),
      supabase.from("song_songwriters").select("artists(id, name, mbid)").eq("song_id", canonicalId),
      supabase.from("track_featuring_artists").select("artists(id, name, mbid)").eq("track_id", canonicalId),
      supabase.from("song_samples").select("tracks!song_samples_sampled_song_id_fkey(id, name, albums(release_date, image_url), artists(id, name))").eq("song_id", canonicalId).limit(10),
      supabase.from("song_samples").select("tracks!song_samples_song_id_fkey(id, name, albums(release_date, image_url), artists(id, name))").eq("sampled_song_id", canonicalId).limit(10),
      supabase.from("song_covers").select("tracks!song_covers_original_song_id_fkey(id, name, albums(release_date, image_url), artists(id, name))").eq("song_id", canonicalId).limit(10),
      supabase.from("tracks").select("credits_enriched_at").eq("id", canonicalId).maybeSingle(),
    ]);

    function toSongRef(r: any, trackKey: string) {
      const t = r[trackKey];
      if (!t) return null;
      const releaseDate: string | null = (t as any).albums?.release_date ?? null;
      return {
        id: (t as any).id,
        name: (t as any).name,
        artist_name: (t as any).artists?.name ?? "",
        artist_id: (t as any).artists?.id ?? "",
        album_image_url: (t as any).albums?.image_url ?? null,
        release_year: releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : null,
      };
    }

    const producers = (producersResult.data ?? []).map((r: any) => r.artists).filter(Boolean);
    const songwriters = (songwritersResult.data ?? []).map((r: any) => r.artists).filter(Boolean);
    const featuring = (featResult.data ?? []).map((r: any) => r.artists).filter(Boolean);
    const samples = (samplesResult.data ?? []).map((r: any) => toSongRef(r, "tracks")).filter(Boolean);
    const sampled_by = (sampledByResult.data ?? []).map((r: any) => toSongRef(r, "tracks")).filter(Boolean);
    const covers = (coversResult.data ?? []).map((r: any) => toSongRef(r, "tracks")).filter(Boolean);
    const credits_enriched_at = (creditsMetaResult.data as any)?.credits_enriched_at ?? null;

    const reviews = (reviewsResult?.reviews ?? []).map((r) => ({
      id: r.id,
      user_id: r.user_id,
      username: r.username ?? null,
      avatar_url: r.user?.avatar_url ?? null,
      rating: r.rating,
      review_text: r.review_text ?? null,
      created_at: r.created_at,
      like_count: 0,
    }));

    return ok(res, {
      recent_listens: recentListensData,
      recommended: recommendedData,
      song: {
        id: spotifyId ?? canonicalId,
        canonical_id: canonicalId,
        name: trackRow.name,
        artist: artist?.name ?? "",
        artist_id: spotifyId ? artist?.id ?? null : null,
        duration_ms: trackRow.duration_ms ?? null,
        track_number: trackRow.track_number ?? null,
        image_url: album?.image_url ?? null,
        release_date: album?.release_date ?? null,
        album_name: album?.name ?? null,
        album_id: album?.id ?? null,
      },
      stats: {
        average_rating: statsResult.average_rating,
        play_count: statsResult.listen_count,
        favorite_count: 0,
        review_count: statsResult.review_count,
        rating_distribution: statsResult.rating_distribution ?? null,
      },
      reviews: {
        items: reviews,
        average_rating: reviewsResult?.average_rating ?? null,
        count: reviewsResult?.count ?? 0,
        my_review: reviewsResult?.my_review
          ? { id: reviewsResult.my_review.id, rating: reviewsResult.my_review.rating, review_text: reviewsResult.my_review.review_text }
          : null,
      },
      producers,
      songwriters,
      featuring,
      samples,
      sampled_by,
      covers,
      credits_enriched_at,
    });
  } catch (e) {
    return internalError(res, e);
  }
});

/** GET /api/songs/:id/leaderboard */
songsRouter.get("/:id/leaderboard", async (req, res) => {
  try {
    const rawId = req.params.id;
    if (!isValidSpotifyId(rawId) && !isValidUuid(rawId)) return ok(res, []);
    if (!isSupabaseConfigured()) return ok(res, []);
    const viewerId = await getSessionUserId(req).catch(() => null);
    if (!viewerId) return ok(res, []);

    const supabase = getSupabase();
    const canonicalId = await resolveCanonicalTrackUuidFromEntityId(supabase, rawId);
    if (!canonicalId) return ok(res, []);

    const { data: followRows } = await supabase.from("follows").select("following_id").eq("follower_id", viewerId).limit(200);
    const friendIds = [viewerId, ...((followRows ?? []) as { following_id: string }[]).map((f) => f.following_id)];
    const playMap = await getTrackStatsForTrackIds([canonicalId]);
    const trackStats = playMap[canonicalId];

    // Get per-user play counts from logs
    const { data: logs } = await supabase
      .from("logs")
      .select("user_id")
      .eq("track_id", canonicalId)
      .in("user_id", friendIds);

    if (!logs?.length) return ok(res, []);

    const counts = new Map<string, number>();
    for (const l of logs as { user_id: string }[]) {
      counts.set(l.user_id, (counts.get(l.user_id) ?? 0) + 1);
    }

    const userIds = [...counts.keys()];
    const { data: users } = await supabase.from("users").select("id, username, avatar_url").in("id", userIds);
    const userMap = new Map(((users ?? []) as { id: string; username: string; avatar_url: string | null }[]).map(u => [u.id, u]));

    const entries = userIds
      .map(uid => ({ userId: uid, playCount: counts.get(uid) ?? 0, user: userMap.get(uid) }))
      .filter(e => e.user)
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, 10)
      .map(e => ({
        userId: e.userId,
        username: e.user!.username,
        avatarUrl: e.user!.avatar_url ?? null,
        playCount: e.playCount,
        isViewer: e.userId === viewerId,
      }));

    return ok(res, entries);
  } catch (e) {
    return internalError(res, e);
  }
});
