import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { ListenLogWithUser, ReviewWithUser } from "@/types";

// ---------------------------------------------------------------------------
// Passive listen logs (Spotify history)
// ---------------------------------------------------------------------------

export async function getListenLogsForUser(
  userId: string,
  limit = 30,
): Promise<ListenLogWithUser[]> {
  return getListenLogsInternal({ userId, limit });
}

export async function getListenLogsForTrack(
  spotifyTrackId: string,
  limit = 30,
): Promise<ListenLogWithUser[]> {
  return getListenLogsInternal({ spotifyTrackId, limit });
}

async function getListenLogsInternal(opts: {
  userId?: string;
  spotifyTrackId?: string;
  limit: number;
}): Promise<ListenLogWithUser[]> {
  try {
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("logs")
      .select("id, user_id, track_id, listened_at, source, created_at")
      .order("listened_at", { ascending: false })
      .limit(opts.limit);

    if (opts.userId) query = query.eq("user_id", opts.userId);
    if (opts.spotifyTrackId)
      query = query.eq("track_id", opts.spotifyTrackId);

    const { data: logs, error } = await query;
    if (error || !logs?.length) return [];

    const userIds = [...new Set(logs.map((l) => l.user_id))];
    const { data: users } = await supabase
      .from("users")
      .select("id, email, username, avatar_url, bio, created_at")
      .in("id", userIds);

    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    return logs.map((log) => ({
      id: log.id,
      user_id: log.user_id,
      track_id: log.track_id,
      listened_at: log.listened_at,
      source: log.source ?? null,
      created_at: log.created_at,
      user: userMap.get(log.user_id) ?? null,
    }));
  } catch (e) {
    console.error("[queries] getListenLogsInternal failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Active reviews (ratings + optional text)
// ---------------------------------------------------------------------------

type EntityReviewItem = {
  id: string;
  user_id: string;
  username: string | null;
  entity_type: string;
  entity_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  updated_at: string;
};

export type ReviewsResult = {
  reviews: EntityReviewItem[];
  average_rating: number | null;
  count: number;
  my_review: EntityReviewItem | null;
};

export async function getReviewsForEntity(
  entityType: "album" | "song",
  entityId: string,
  limit = 20,
): Promise<ReviewsResult | null> {
  try {
    const supabase = createSupabaseServerClient();

    const { data: rows, error } = await supabase
      .from("reviews")
      .select(
        "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at",
      )
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return null;

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id ?? null;

    const reviewRows = rows ?? [];
    const userIds = [...new Set(reviewRows.map((r) => r.user_id))];
    const { data: users } = await supabase
      .from("users")
      .select("id, username")
      .in("id", userIds);
    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    const reviews: EntityReviewItem[] = reviewRows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      username: userMap.get(r.user_id)?.username ?? null,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      rating: r.rating,
      review_text: r.review_text ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    const count = reviews.length;
    const sum = reviews.reduce((a, r) => a + r.rating, 0);
    const average_rating =
      count > 0 ? Math.round((sum / count) * 10) / 10 : null;

    const { count: total_count } = await supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", entityType)
      .eq("entity_id", entityId);

    let my_review: EntityReviewItem | null = null;
    if (userId) {
      const { data: myRow } = await supabase
        .from("reviews")
        .select(
          "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at",
        )
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("user_id", userId)
        .maybeSingle();
      if (myRow) {
        const sessionUsername =
          (session?.user as { username?: string } | undefined)?.username ?? null;
        my_review = {
          id: myRow.id,
          user_id: myRow.user_id,
          username: sessionUsername,
          entity_type: myRow.entity_type,
          entity_id: myRow.entity_id,
          rating: myRow.rating,
          review_text: myRow.review_text ?? null,
          created_at: myRow.created_at,
          updated_at: myRow.updated_at,
        };
      }
    }

    return {
      reviews,
      average_rating,
      count: total_count ?? reviews.length,
      my_review,
    };
  } catch (e) {
    console.error("[queries] getReviewsForEntity failed:", e);
    return null;
  }
}

/** Fetch recent reviews by a user (for "Recent Activity" on profile). */
export async function getReviewsForUser(
  userId: string,
  limit = 30,
): Promise<ReviewWithUser[]> {
  try {
    const supabase = createSupabaseServerClient();

    const { data: rows, error } = await supabase
      .from("reviews")
      .select(
        "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !rows?.length) return [];

    const { data: users } = await supabase
      .from("users")
      .select("id, email, username, avatar_url, bio, created_at")
      .eq("id", userId);

    const user = users?.[0] ?? null;

    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      entity_type: r.entity_type as "album" | "song",
      entity_id: r.entity_id,
      rating: r.rating,
      review_text: r.review_text ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      user,
    }));
  } catch (e) {
    console.error("[queries] getReviewsForUser failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Entity stats (listen count + rating aggregation)
// ---------------------------------------------------------------------------

export type EntityStats = {
  listen_count: number;
  average_rating: number | null;
  review_count: number;
};

export async function getEntityStats(
  entityType: "album" | "song",
  entityId: string,
): Promise<EntityStats> {
  try {
    const supabase = createSupabaseServerClient();

    let listen_count = 0;
    if (entityType === "song") {
      const { count } = await supabase
        .from("logs")
        .select("id", { count: "exact", head: true })
        .eq("track_id", entityId);
      listen_count = count ?? 0;
    } else {
      const { data: tracks } = await supabase
        .from("songs")
        .select("id")
        .eq("album_id", entityId);
      if (tracks?.length) {
        const ids = tracks.map((t) => t.id);
        const { count } = await supabase
          .from("logs")
          .select("id", { count: "exact", head: true })
          .in("track_id", ids);
        listen_count = count ?? 0;
      }
    }

    const { data: reviewRows } = await supabase
      .from("reviews")
      .select("rating")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId);

    const ratings = (reviewRows ?? []).map((r) => r.rating);
    const review_count = ratings.length;
    const sum = ratings.reduce((a, b) => a + b, 0);
    const average_rating =
      review_count > 0 ? Math.round((sum / review_count) * 10) / 10 : null;

    return { listen_count, average_rating, review_count };
  } catch (e) {
    console.error("[queries] getEntityStats failed:", e);
    return { listen_count: 0, average_rating: null, review_count: 0 };
  }
}

/** Per-track stats for multiple song IDs (listens + reviews). Returns a map of trackId -> stats. */
export async function getTrackStatsForTrackIds(
  trackIds: string[],
): Promise<Record<string, EntityStats>> {
  const empty: EntityStats = { listen_count: 0, average_rating: null, review_count: 0 };
  if (trackIds.length === 0) return {};

  try {
    const supabase = createSupabaseServerClient();

    const [logsRes, reviewsRes] = await Promise.all([
      supabase.from("logs").select("track_id").in("track_id", trackIds),
      supabase
        .from("reviews")
        .select("entity_id, rating")
        .eq("entity_type", "song")
        .in("entity_id", trackIds),
    ]);

    const listenCounts = new Map<string, number>();
    for (const row of logsRes.data ?? []) {
      listenCounts.set(row.track_id, (listenCounts.get(row.track_id) ?? 0) + 1);
    }

    const reviewCounts = new Map<string, number>();
    const ratingSums = new Map<string, number>();
    for (const row of reviewsRes.data ?? []) {
      reviewCounts.set(row.entity_id, (reviewCounts.get(row.entity_id) ?? 0) + 1);
      ratingSums.set(
        row.entity_id,
        (ratingSums.get(row.entity_id) ?? 0) + row.rating,
      );
    }

    const result: Record<string, EntityStats> = {};
    for (const trackId of trackIds) {
      const listen_count = listenCounts.get(trackId) ?? 0;
      const review_count = reviewCounts.get(trackId) ?? 0;
      const sum = ratingSums.get(trackId) ?? 0;
      const average_rating =
        review_count > 0 ? Math.round((sum / review_count) * 10) / 10 : null;
      result[trackId] = { listen_count, average_rating, review_count };
    }
    return result;
  } catch (e) {
    console.error("[queries] getTrackStatsForTrackIds failed:", e);
    return Object.fromEntries(trackIds.map((id) => [id, empty]));
  }
}

// ---------------------------------------------------------------------------
// Artist-scoped queries
// ---------------------------------------------------------------------------

/** Reviews for any album or track belonging to an artist. */
export async function getReviewsForArtist(
  artistId: string,
  limit = 10,
): Promise<EntityReviewItem[]> {
  try {
    const supabase = createSupabaseServerClient();

    const [{ data: albumRows }, { data: songRows }] = await Promise.all([
      supabase.from("albums").select("id").eq("artist_id", artistId),
      supabase.from("songs").select("id").eq("artist_id", artistId),
    ]);

    const entityIds = [
      ...(albumRows ?? []).map((a) => a.id),
      ...(songRows ?? []).map((s) => s.id),
    ];
    if (entityIds.length === 0) return [];

    const { data: rows, error } = await supabase
      .from("reviews")
      .select(
        "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at",
      )
      .in("entity_id", entityIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !rows?.length) return [];

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: users } = await supabase
      .from("users")
      .select("id, username")
      .in("id", userIds);
    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      username: userMap.get(r.user_id)?.username ?? null,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      rating: r.rating,
      review_text: r.review_text ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  } catch (e) {
    console.error("[queries] getReviewsForArtist failed:", e);
    return [];
  }
}

/** Top tracks for an artist: ordered by listen count, then all other cached tracks so we show a full list. */
export async function getTopTracksForArtist(
  artistId: string,
  limit = 10,
): Promise<SpotifyApi.TrackObjectSimplified[]> {
  try {
    const supabase = createSupabaseServerClient();

    const { data: songRows } = await supabase
      .from("songs")
      .select("id, name, album_id, artist_id, duration_ms")
      .eq("artist_id", artistId);
    if (!songRows?.length) return [];

    const trackIds = songRows.map((s) => s.id);
    const { data: logRows } = await supabase
      .from("logs")
      .select("track_id")
      .in("track_id", trackIds);

    const counts = new Map<string, number>();
    for (const l of logRows ?? []) {
      counts.set(l.track_id, (counts.get(l.track_id) ?? 0) + 1);
    }
    // Sort: logged tracks by count desc, then all others (by name) so we show a full list
    const sortedIds = [...trackIds].sort((a, b) => {
      const countA = counts.get(a) ?? 0;
      const countB = counts.get(b) ?? 0;
      if (countB !== countA) return countB - countA;
      const nameA = songRows.find((s) => s.id === a)?.name ?? "";
      const nameB = songRows.find((s) => s.id === b)?.name ?? "";
      return nameA.localeCompare(nameB);
    }).slice(0, limit);

    const songMap = new Map(songRows.map((s) => [s.id, s]));
    const albumIds = [...new Set(songRows.map((s) => s.album_id))];
    const artistIds = [...new Set(songRows.map((s) => s.artist_id))];

    const [{ data: albumRows }, { data: artistRows }] = await Promise.all([
      supabase.from("albums").select("id, name, image_url").in("id", albumIds),
      supabase.from("artists").select("id, name").in("id", artistIds),
    ]);
    const albumMap = new Map((albumRows ?? []).map((a) => [a.id, a]));
    const artistMap = new Map((artistRows ?? []).map((a) => [a.id, a]));

    return sortedIds
      .map((id) => {
        const song = songMap.get(id);
        if (!song || song.artist_id !== artistId) return null;
        const album = albumMap.get(song.album_id);
        return {
          id: song.id,
          name: song.name,
          artists: [{ id: song.artist_id, name: artistMap.get(song.artist_id)?.name ?? "" }],
          duration_ms: song.duration_ms ?? undefined,
          album: album
            ? {
                id: album.id,
                name: album.name,
                images: album.image_url ? [{ url: album.image_url }] : undefined,
              }
            : undefined,
        } as SpotifyApi.TrackObjectSimplified;
      })
      .filter((x): x is SpotifyApi.TrackObjectSimplified => x !== null);
  } catch (e) {
    console.error("[queries] getTopTracksForArtist failed:", e);
    return [];
  }
}

/** Recent listen logs for tracks by an artist. */
export async function getListenLogsForArtist(
  artistId: string,
  limit = 20,
): Promise<ListenLogWithUser[]> {
  try {
    const supabase = createSupabaseServerClient();

    const { data: songRows } = await supabase
      .from("songs")
      .select("id")
      .eq("artist_id", artistId);

    const trackIds = (songRows ?? []).map((s) => s.id);
    if (trackIds.length === 0) return [];

    const { data: logs, error } = await supabase
      .from("logs")
      .select("id, user_id, track_id, listened_at, source, created_at")
      .in("track_id", trackIds)
      .order("listened_at", { ascending: false })
      .limit(limit);

    if (error || !logs?.length) return [];

    const userIds = [...new Set(logs.map((l) => l.user_id))];
    const { data: users } = await supabase
      .from("users")
      .select("id, email, username, avatar_url, bio, created_at")
      .in("id", userIds);
    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    return logs.map((log) => ({
      id: log.id,
      user_id: log.user_id,
      track_id: log.track_id,
      listened_at: log.listened_at,
      source: log.source ?? null,
      created_at: log.created_at,
      user: userMap.get(log.user_id) ?? null,
    }));
  } catch (e) {
    console.error("[queries] getListenLogsForArtist failed:", e);
    return [];
  }
}

/** Albums by an artist with composite popularity score. */
export async function getPopularAlbumsForArtist(
  artistId: string,
  limit = 10,
): Promise<
  { id: string; name: string; image_url: string | null; listen_count: number; review_count: number; average_rating: number | null }[]
> {
  try {
    const supabase = createSupabaseServerClient();

    const { data: albumRows } = await supabase
      .from("albums")
      .select("id, name, image_url")
      .eq("artist_id", artistId);

    if (!albumRows?.length) return [];

    const albumIds = albumRows.map((a) => a.id);

    const [{ data: songRows }, { data: reviewRows }] = await Promise.all([
      supabase.from("songs").select("id, album_id").in("album_id", albumIds),
      supabase
        .from("reviews")
        .select("entity_id, rating")
        .eq("entity_type", "album")
        .in("entity_id", albumIds),
    ]);

    const trackIds = (songRows ?? []).map((s) => s.id);
    const trackToAlbum = new Map((songRows ?? []).map((s) => [s.id, s.album_id]));

    const listensByAlbum = new Map<string, number>();
    if (trackIds.length > 0) {
      const { data: logRows } = await supabase
        .from("logs")
        .select("track_id")
        .in("track_id", trackIds);
      for (const l of logRows ?? []) {
        const albumId = trackToAlbum.get(l.track_id);
        if (albumId) listensByAlbum.set(albumId, (listensByAlbum.get(albumId) ?? 0) + 1);
      }
    }

    const reviewsByAlbum = new Map<string, number>();
    const ratingSumByAlbum = new Map<string, number>();
    for (const r of reviewRows ?? []) {
      reviewsByAlbum.set(r.entity_id, (reviewsByAlbum.get(r.entity_id) ?? 0) + 1);
      ratingSumByAlbum.set(
        r.entity_id,
        (ratingSumByAlbum.get(r.entity_id) ?? 0) + r.rating,
      );
    }

    return albumRows
      .map((a) => {
        const listen_count = listensByAlbum.get(a.id) ?? 0;
        const review_count = reviewsByAlbum.get(a.id) ?? 0;
        const sum = ratingSumByAlbum.get(a.id) ?? 0;
        const average_rating =
          review_count > 0 ? Math.round((sum / review_count) * 10) / 10 : null;
        const popularity_score =
          listen_count * 1 + review_count * 5 + (average_rating ?? 0) * 3;
        return {
          id: a.id,
          name: a.name,
          image_url: a.image_url ?? null,
          listen_count,
          review_count,
          average_rating,
          _score: popularity_score,
        };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, limit)
      .map(({ id, name, image_url, listen_count, review_count, average_rating }) => ({
        id,
        name,
        image_url,
        listen_count,
        review_count,
        average_rating,
      }));
  } catch (e) {
    console.error("[queries] getPopularAlbumsForArtist failed:", e);
    return [];
  }
}

/** Users who recently listened to tracks from an album. */
export async function getAlbumListeners(
  albumId: string,
  limit = 10,
): Promise<{ user_id: string; username: string; avatar_url: string | null; listened_at: string }[]> {
  try {
    const supabase = createSupabaseServerClient();

    const { data: songRows } = await supabase
      .from("songs")
      .select("id")
      .eq("album_id", albumId);

    const trackIds = (songRows ?? []).map((s) => s.id);
    if (trackIds.length === 0) return [];

    const { data: logs, error } = await supabase
      .from("logs")
      .select("user_id, listened_at")
      .in("track_id", trackIds)
      .order("listened_at", { ascending: false })
      .limit(100);

    if (error || !logs?.length) return [];

    const seen = new Set<string>();
    const unique: { user_id: string; listened_at: string }[] = [];
    for (const l of logs) {
      if (seen.has(l.user_id)) continue;
      seen.add(l.user_id);
      unique.push(l);
      if (unique.length >= limit) break;
    }

    const userIds = unique.map((u) => u.user_id);
    const { data: users } = await supabase
      .from("users")
      .select("id, username, avatar_url")
      .in("id", userIds);
    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    return unique
      .map((u) => {
        const user = userMap.get(u.user_id);
        if (!user) return null;
        return {
          user_id: u.user_id,
          username: user.username,
          avatar_url: user.avatar_url ?? null,
          listened_at: u.listened_at,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  } catch (e) {
    console.error("[queries] getAlbumListeners failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Social feed
// ---------------------------------------------------------------------------

/** Fetch recent reviews from followed users (for the social feed). */
export async function getReviewFeed(
  userId: string,
  limit = 50,
): Promise<ReviewWithUser[]> {
  try {
    const supabase = createSupabaseServerClient();

    const { data: followings, error: followError } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", userId);

    if (followError) throw followError;

    const followingIds = (followings ?? [])
      .map((f) => f.following_id)
      .slice(0, 500);
    if (followingIds.length === 0) return [];

    const cappedLimit = Math.min(limit, 100);

    const { data: rows, error: reviewsError } = await supabase
      .from("reviews")
      .select(
        "id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at",
      )
      .in("user_id", followingIds)
      .order("created_at", { ascending: false })
      .limit(cappedLimit);

    if (reviewsError) throw reviewsError;
    if (!rows?.length) return [];

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const { data: users } = await supabase
      .from("users")
      .select("id, email, username, avatar_url, bio, created_at")
      .in("id", userIds);

    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    return rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      entity_type: r.entity_type as "album" | "song",
      entity_id: r.entity_id,
      rating: r.rating,
      review_text: r.review_text ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      user: userMap.get(r.user_id) ?? null,
    }));
  } catch (e) {
    console.error("[queries] getReviewFeed failed:", e);
    return [];
  }
}
