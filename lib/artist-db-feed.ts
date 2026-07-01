import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCanonicalArtistUuidFromEntityId } from "@/lib/catalog/entity-resolution";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/** Album row for mobile /api/artists — same source as web `getPopularAlbumsForArtist`. */
export type ArtistMobileAlbum = {
  id: string;
  name: string;
  artist: string;
  artwork_url: string | null;
  release_date: string | null;
};

/** Track row for mobile (before merging track_stats) — same source as web `getTopTracksForArtist`. */
export type ArtistMobileTrackRow = {
  id: string;
  name: string;
  duration_ms: number | null;
  album_id: string | null;
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

    const { data: statsRows, error: statsError } = await supabase
      .from("album_stats")
      .select(`
        album_id,
        listen_count,
        review_count,
        avg_rating,
        albums!inner (
          id,
          name,
          image_url,
          artist_id
        )
      `)
      .eq("albums.artist_id", canonicalArtistId)
      .order("listen_count", { ascending: false })
      .limit(limit);

    if (statsError || !statsRows?.length) {
      const { data: albumRows } = await supabase
        .from("albums")
        .select("id, name, image_url")
        .eq("artist_id", canonicalArtistId)
        .order("name", { ascending: true })
        .limit(limit);

      return (albumRows ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        artist: artistName,
        artwork_url: a.image_url ?? null,
        release_date: null,
      }));
    }

    return (
      statsRows as unknown as {
        album_id: string;
        albums: {
          id: string;
          name: string;
          image_url: string | null;
          artist_id: string;
        };
      }[]
    ).map((row) => ({
      id: row.album_id,
      name: row.albums.name,
      artist: artistName,
      artwork_url: row.albums.image_url ?? null,
      release_date: null,
    }));
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
          duration_ms: song.duration_ms ?? null,
          album_id: song.album_id ?? null,
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

export async function fetchArtistViewerStats(
  canonicalArtistId: string,
  viewerId: string,
): Promise<ArtistViewerStats> {
  const empty: ArtistViewerStats = { playCount: 0, topAlbumName: null, topAlbumId: null, firstListened: null };
  try {
    const supabase = createSupabaseAdminClient();

    // Play count from aggregates — accurate even when tracks.artist_id is NULL
    const { data: artistAgg } = await supabase
      .from("user_listening_aggregates")
      .select("count")
      .eq("user_id", viewerId)
      .eq("entity_type", "artist")
      .eq("entity_id", canonicalArtistId)
      .is("week_start", null)
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
        .order("count", { ascending: false })
        .limit(1);

      topAlbumId = (albumAggs as { entity_id: string; count: number }[] | null)?.[0]?.entity_id ?? null;
      if (topAlbumId) {
        const { data: albumRow } = await supabase.from("albums").select("name").eq("id", topAlbumId).maybeSingle();
        topAlbumName = (albumRow as { name?: string } | null)?.name ?? null;
      }
    }

    // First listened still from logs (aggregates don't store timestamps)
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
  } catch {
    return empty;
  }
}

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

export async function fetchArtistRecentListens(
  canonicalArtistId: string,
  viewerId: string | null,
  limit = 8,
): Promise<ArtistRecentListen[]> {
  try {
    const supabase = createSupabaseAdminClient();
    const { data: trackRows } = await supabase
      .from("tracks").select("id, album_id, name").eq("artist_id", canonicalArtistId).limit(500);
    const tracks = (trackRows ?? []) as { id: string; album_id: string | null; name: string }[];
    if (!tracks.length) return [];

    const trackIds = tracks.map((t) => t.id);
    const trackMap = new Map(tracks.map((t) => [t.id, t]));

    let userIds: string[] | null = null;
    if (viewerId) {
      const { data: follows } = await supabase
        .from("follows").select("following_id").eq("follower_id", viewerId).limit(200);
      userIds = [viewerId, ...((follows ?? []) as { following_id: string }[]).map((f) => f.following_id)];
    }

    let logsQuery = supabase
      .from("logs").select("id, user_id, track_id, listened_at").in("track_id", trackIds.slice(0, 200));
    if (userIds) logsQuery = logsQuery.in("user_id", userIds);
    const { data: logRows } = await logsQuery.order("listened_at", { ascending: false }).limit(limit);
    if (!logRows?.length) return [];

    const logUserIds = [...new Set((logRows as { user_id: string }[]).map((l) => l.user_id))];
    const { data: users } = await supabase
      .from("users").select("id, username, avatar_url").in("id", logUserIds);
    const userMap = new Map(
      ((users ?? []) as { id: string; username: string; avatar_url: string | null }[]).map((u) => [u.id, u]),
    );

    const albumIds = [
      ...new Set(
        (logRows as { track_id: string }[])
          .map((l) => trackMap.get(l.track_id)?.album_id)
          .filter(Boolean) as string[],
      ),
    ];
    const { data: albums } = albumIds.length
      ? await supabase.from("albums").select("id, name, image_url").in("id", albumIds)
      : { data: [] };
    const albumMap = new Map(
      ((albums ?? []) as { id: string; name: string; image_url: string | null }[]).map((a) => [a.id, a]),
    );

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
  } catch {
    return [];
  }
}
