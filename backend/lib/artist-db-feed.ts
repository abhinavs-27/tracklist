import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCanonicalArtistUuidFromEntityId } from "./catalogEntityResolution";

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
        .eq("artist_id", artistId)
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
      .eq("artist_id", canonicalArtistId)
      .limit(1000);
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
        };
      })
      .filter((x): x is ArtistMobileTrackRow => x !== null);
  } catch (e) {
    console.error("[artist-db-feed] fetchArtistTracksFromDb:", e);
    return [];
  }
}
