import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCanonicalArtistUuidFromEntityId } from "./catalogEntityResolution";

/** Album row for mobile /api/artists — same source as web `getPopularAlbumsForArtist`. */
export type ArtistMobileAlbum = {
  id: string;
  name: string;
  artist: string;
  artwork_url: string | null;
  release_date: string | null;
  listen_count: number;
  average_rating: number | null;
};

/** Track row for mobile (before merging track_stats) — same source as web `getTopTracksForArtist`. */
export type ArtistMobileTrackRow = {
  id: string;
  name: string;
  album_id: string | null;
  duration_ms: number | null;
};

/**
 * Popular albums for an artist from DB (album_stats + albums), with fallback to plain albums list.
 * Mirrors `getPopularAlbumsForArtist` in queries.ts.
 */
export async function fetchArtistAlbumsFromDb(
  supabase: SupabaseClient,
  artistId: string,
  artistName: string,
  limit = 12,
): Promise<ArtistMobileAlbum[]> {
  try {
    const canonicalArtistId =
      await resolveCanonicalArtistUuidFromEntityId(supabase, artistId);
    if (!canonicalArtistId) return [];

    // Step 1: fetch all albums for this artist (large pool), then rank by plays — mirrors web's getPopularAlbumsForArtist
    const { data: albumRows } = await supabase
      .from("albums")
      .select("id, name, image_url")
      .eq("artist_id", canonicalArtistId)
      .limit(500);

    if (!albumRows?.length) return [];

    const albumIds = albumRows.map((a) => a.id as string);

    // Step 2: get stats for all albums
    const { data: statsRows } = await supabase
      .from("album_stats")
      .select("album_id, listen_count, avg_rating")
      .in("album_id", albumIds);

    const statsMap = new Map(
      ((statsRows ?? []) as { album_id: string; listen_count: number | null; avg_rating: number | null }[])
        .map((s) => [s.album_id, s]),
    );

    // Sort by listen_count descending, then limit to requested count
    const sorted = [...albumRows]
      .sort((a, b) => {
        const cA = statsMap.get(a.id)?.listen_count ?? 0;
        const cB = statsMap.get(b.id)?.listen_count ?? 0;
        return cB - cA;
      })
      .slice(0, limit);

    return sorted.map((a) => {
      const stats = statsMap.get(a.id);
      return {
        id: a.id,
        name: a.name,
        artist: artistName,
        artwork_url: (a.image_url as string | null) ?? null,
        release_date: null,
        listen_count: stats?.listen_count ?? 0,
        average_rating: stats?.avg_rating ?? null,
      };
    });
  } catch (e) {
    console.error("[artist-db-feed] fetchArtistAlbumsFromDb:", e);
    return [];
  }
}

/**
 * Top tracks for an artist from `songs` + listen stats ordering.
 * Mirrors `getTopTracksForArtist` in queries.ts.
 */
export async function fetchArtistTracksFromDb(
  supabase: SupabaseClient,
  artistId: string,
  limit = 10,
): Promise<ArtistMobileTrackRow[]> {
  try {
    const canonicalArtistId =
      await resolveCanonicalArtistUuidFromEntityId(supabase, artistId);
    if (!canonicalArtistId) return [];

    const { data: songRows } = await supabase
      .from("tracks")
      .select("id, name, album_id, artist_id, duration_ms")
      .eq("artist_id", canonicalArtistId);
    if (!songRows?.length) return [];

    const trackIds = songRows.map((s) => s.id);
    const { data: statsRows } = await supabase
      .from("track_stats")
      .select("track_id, listen_count")
      .in("track_id", trackIds);

    const counts = new Map<string, number>();
    for (const s of statsRows ?? []) {
      counts.set(s.track_id, s.listen_count ?? 0);
    }

    const sortedIds = [...trackIds]
      .sort((a, b) => {
        const countA = counts.get(a) ?? 0;
        const countB = counts.get(b) ?? 0;
        if (countB !== countA) return countB - countA;
        const nameA = songRows.find((s) => s.id === a)?.name ?? "";
        const nameB = songRows.find((s) => s.id === b)?.name ?? "";
        return nameA.localeCompare(nameB);
      })
      .slice(0, limit);

    const songMap = new Map(songRows.map((s) => [s.id, s]));

    return sortedIds
      .map((tid) => {
        const song = songMap.get(tid);
        if (!song || song.artist_id !== canonicalArtistId) return null;
        return {
          id: song.id,
          name: song.name,
          album_id: song.album_id ?? null,
          duration_ms: song.duration_ms ?? null,
        };
      })
      .filter((x): x is ArtistMobileTrackRow => x !== null);
  } catch (e) {
    console.error("[artist-db-feed] fetchArtistTracksFromDb:", e);
    return [];
  }
}

export type ArtistViewerStats = {
  playCount: number;
  topAlbumName: string | null;
  topAlbumId: string | null;
  firstListened: string | null;
};

export type ArtistRecentListen = {
  id: string;
  track_id: string;
  track_name: string | null;
  album_id: string | null;
  album_name: string | null;
  album_image: string | null;
  listened_at: string;
  user: { id: string; username: string; avatar_url: string | null } | null;
};

/** Viewer play count, top album, and first listen date for an artist. */
export async function fetchArtistViewerStats(
  supabase: SupabaseClient,
  viewerId: string,
  canonicalArtistId: string,
): Promise<ArtistViewerStats> {
  const empty: ArtistViewerStats = { playCount: 0, topAlbumName: null, topAlbumId: null, firstListened: null };
  try {
    // Play count from aggregates — accurate even when tracks.artist_id is NULL
    const { data: artistAgg } = await supabase
      .from("user_listening_aggregates")
      .select("count")
      .eq("user_id", viewerId)
      .eq("entity_type", "artist")
      .eq("entity_id", canonicalArtistId)
      .is("week_start", null)
      .is("month", null)
      .is("year", null)
      .maybeSingle();

    const playCount = (artistAgg as { count?: number } | null)?.count ?? 0;
    if (!playCount) return empty;

    // Top album from album aggregates — accurate for same reason
    const { data: albumRows } = await supabase
      .from("albums")
      .select("id")
      .eq("artist_id", canonicalArtistId)
      .limit(200);

    const albumIds = (albumRows ?? []).map((a) => (a as { id: string }).id);
    let topAlbumId: string | null = null;
    let topAlbumName: string | null = null;

    if (albumIds.length) {
      const { data: albumAggs } = await supabase
        .from("user_listening_aggregates")
        .select("entity_id, count")
        .eq("user_id", viewerId)
        .eq("entity_type", "album")
        .in("entity_id", albumIds)
        .is("week_start", null)
        .is("month", null)
        .is("year", null)
        .order("count", { ascending: false })
        .limit(1);

      topAlbumId = (albumAggs as { entity_id: string; count: number }[] | null)?.[0]?.entity_id ?? null;
      if (topAlbumId) {
        const { data: albumRow } = await supabase.from("albums").select("name").eq("id", topAlbumId).maybeSingle();
        topAlbumName = (albumRow as { name?: string } | null)?.name ?? null;
      }
    }

    // First listened from logs (aggregates don't store timestamps)
    const { data: trackRows } = await supabase
      .from("tracks").select("id").eq("artist_id", canonicalArtistId).limit(2000);
    const trackIds = (trackRows ?? []).map((t) => (t as { id: string }).id);
    let firstListened: string | null = null;
    if (trackIds.length) {
      const CHUNK = 200;
      for (let i = 0; i < trackIds.length; i += CHUNK) {
        const chunk = trackIds.slice(i, i + CHUNK);
        const { data: logRows } = await supabase
          .from("logs").select("listened_at").eq("user_id", viewerId).in("track_id", chunk)
          .order("listened_at", { ascending: true }).limit(1);
        const date = (logRows as { listened_at?: string }[] | null)?.[0]?.listened_at;
        if (date && (!firstListened || date < firstListened)) firstListened = date;
      }
    }

    return { playCount, topAlbumName, topAlbumId, firstListened };
  } catch { return empty; }
}

/** Recent listens by viewer + people they follow for this artist. */
export async function fetchArtistRecentListens(
  supabase: SupabaseClient,
  canonicalArtistId: string,
  viewerId: string | null,
  limit = 8,
): Promise<ArtistRecentListen[]> {
  try {
    const { data: trackRows } = await supabase
      .from("tracks").select("id, album_id, name").eq("artist_id", canonicalArtistId).limit(500);
    const tracks = (trackRows ?? []) as { id: string; album_id: string | null; name: string }[];
    if (!tracks.length) return [];

    const trackIds = tracks.map((t) => t.id);
    const trackMap = new Map(tracks.map((t) => [t.id, t]));

    // Get follow list for viewer (to show friends)
    let userIds: string[] | null = null;
    if (viewerId) {
      const { data: follows } = await supabase.from("follows").select("following_id").eq("follower_id", viewerId).limit(200);
      userIds = [viewerId, ...((follows ?? []) as { following_id: string }[]).map((f) => f.following_id)];
    }

    let logsQuery = supabase
      .from("logs").select("id, user_id, track_id, listened_at").in("track_id", trackIds.slice(0, 200));
    if (userIds) logsQuery = logsQuery.in("user_id", userIds);
    const { data: logRows } = await logsQuery.order("listened_at", { ascending: false }).limit(limit);

    if (!logRows?.length) return [];

    const logUserIds = [...new Set((logRows as { user_id: string }[]).map((l) => l.user_id))];
    const { data: users } = await supabase.from("users").select("id, username, avatar_url").in("id", logUserIds);
    const userMap = new Map(((users ?? []) as { id: string; username: string; avatar_url: string | null }[]).map((u) => [u.id, u]));

    // Get album metadata
    const albumIds = [...new Set((logRows as { track_id: string }[]).map((l) => trackMap.get(l.track_id)?.album_id).filter(Boolean) as string[])];
    const { data: albums } = albumIds.length
      ? await supabase.from("albums").select("id, name, image_url").in("id", albumIds)
      : { data: [] };
    const albumMap = new Map(((albums ?? []) as { id: string; name: string; image_url: string | null }[]).map((a) => [a.id, a]));

    return (logRows as { id: string; user_id: string; track_id: string; listened_at: string }[]).map((log) => {
      const track = trackMap.get(log.track_id);
      const albumId = track?.album_id ?? null;
      const album = albumId ? albumMap.get(albumId) : null;
      const user = userMap.get(log.user_id) ?? null;
      return {
        id: log.id,
        track_id: log.track_id,
        track_name: track?.name ?? null,
        album_id: albumId,
        album_name: album?.name ?? null,
        album_image: album?.image_url ?? null,
        listened_at: log.listened_at,
        user: user ? { id: user.id, username: user.username, avatar_url: user.avatar_url } : null,
      };
    });
  } catch { return []; }
}

/** Lightweight review fetch for the main artist API response. Mirrors getReviewsForArtist in queries.ts. */
export async function fetchArtistReviewsSimple(
  supabase: SupabaseClient,
  canonicalArtistId: string,
  limit = 6,
): Promise<object[]> {
  try {
    const [{ data: albumRows }, { data: trackRows }] = await Promise.all([
      supabase.from("albums").select("id, name, image_url").eq("artist_id", canonicalArtistId).limit(1000),
      supabase.from("tracks").select("id, name").eq("artist_id", canonicalArtistId).limit(1000),
    ]);

    const albumMap = new Map(((albumRows ?? []) as { id: string; name: string; image_url: string | null }[]).map((a) => [a.id, a]));
    const trackNameMap = new Map(((trackRows ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));
    const entityIds = [...albumMap.keys(), ...trackNameMap.keys()];
    if (!entityIds.length) return [];

    // No review_text filter — matches web which shows rating-only reviews too
    const { data: reviews } = await supabase
      .from("reviews")
      .select("id, user_id, entity_type, entity_id, rating, review_text, created_at, users(id, username, avatar_url)")
      .in("entity_id", entityIds)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!reviews?.length) return [];

    type ReviewRow = {
      id: string;
      user_id: string;
      entity_type: string;
      entity_id: string;
      rating: number | null;
      review_text: string | null;
      created_at: string;
      users: { id: string; username: string; avatar_url: string | null } | null;
    };
    const reviewRows = reviews as unknown as ReviewRow[];

    // For song reviews, we need the album image — join tracks→albums like the web does
    const songReviewTrackIds = reviewRows
      .filter((r) => r.entity_type === "song")
      .map((r) => r.entity_id);

    const trackAlbumImageMap = new Map<string, string | null>();
    if (songReviewTrackIds.length > 0) {
      const { data: trackAlbumRows } = await supabase
        .from("tracks")
        .select("id, album_id, albums(image_url)")
        .in("id", songReviewTrackIds);
      for (const t of (trackAlbumRows ?? []) as unknown as { id: string; album_id: string | null; albums: { image_url: string | null } | { image_url: string | null }[] | null }[]) {
        const img = Array.isArray(t.albums) ? t.albums[0]?.image_url : t.albums?.image_url;
        trackAlbumImageMap.set(t.id, img ?? null);
      }
    }

    return reviewRows.map((r) => {
      const album = albumMap.get(r.entity_id);
      const entityName = album?.name ?? trackNameMap.get(r.entity_id) ?? null;
      const entityImage = r.entity_type === "album"
        ? (album?.image_url ?? null)
        : (trackAlbumImageMap.get(r.entity_id) ?? null);
      return {
        id: r.id,
        user_id: r.user_id,
        username: r.users?.username ?? null,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        entity_name: entityName,
        entity_image_url: entityImage,
        rating: r.rating,
        review_text: r.review_text ?? null,
        created_at: r.created_at,
        user: r.users ? { id: r.users.id, username: r.users.username, avatar_url: r.users.avatar_url } : null,
      };
    });
  } catch { return []; }
}

export type ArtistLeaderboardEntry = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  playCount: number;
  isViewer: boolean;
};

/** Play-count leaderboard among viewer + their follows. Returns [] if < 2 entries. */
export async function fetchArtistFriendLeaderboard(
  supabase: SupabaseClient,
  viewerId: string,
  canonicalArtistId: string,
): Promise<ArtistLeaderboardEntry[]> {
  try {
    const { data: follows } = await supabase
      .from("follows").select("following_id").eq("follower_id", viewerId).limit(200);
    const friendIds = [viewerId, ...((follows ?? []) as { following_id: string }[]).map((f) => f.following_id)];

    const { data: aggRows } = await supabase
      .from("user_listening_aggregates")
      .select("user_id, count")
      .in("user_id", friendIds)
      .eq("entity_type", "artist")
      .eq("entity_id", canonicalArtistId)
      .is("week_start", null)
      .is("month", null)
      .is("year", null)
      .limit(201);

    const playCounts = new Map<string, number>();
    for (const row of (aggRows ?? []) as { user_id: string; count: number }[]) {
      playCounts.set(row.user_id, row.count);
    }

    if (playCounts.size < 2) return [];

    const userIds = [...playCounts.keys()];
    const { data: users } = await supabase
      .from("users").select("id, username, avatar_url").in("id", userIds);
    const userMap = new Map(((users ?? []) as { id: string; username: string; avatar_url: string | null }[]).map((u) => [u.id, u]));

    return [...playCounts.entries()]
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
  } catch { return []; }
}
