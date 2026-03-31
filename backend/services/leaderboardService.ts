import { getSupabase } from "../lib/supabase";
export type LeaderboardEntry = {
  id: string;
  entity_type: "song" | "album";
  name: string;
  artist: string;
  artwork_url: string | null;
  total_plays: number;
  average_rating: number | null;
  weighted_score?: number;
  favorite_count?: number;
};

export type LeaderboardFilters = {
  year?: number;
  decade?: number;
  startYear?: number;
  endYear?: number;
};

export async function getLeaderboard(
  type: "popular" | "topRated" | "mostFavorited",
  filters: LeaderboardFilters,
  entity: "song" | "album" = "song",
  limit = 50,
): Promise<LeaderboardEntry[]> {
  try {
    const supabase = getSupabase();
    const { year, decade, startYear, endYear } = filters;

    let albumIds: string[] | null = null;

    // Prefer explicit year range if provided
    if (startYear != null || endYear != null) {
      const from = startYear ?? endYear!;
      const to = endYear ?? startYear!;
      const acc: string[] = [];
      let rangeFrom = 0;
      const pageSize = 1000;
      for (;;) {
        const { data: albums, error } = await supabase
          .from("albums")
          .select("id")
          .gte("release_date", `${from}-01-01`)
          .lte("release_date", `${to}-12-31`)
          .range(rangeFrom, rangeFrom + pageSize - 1);
        if (error) break;
        const rows = albums ?? [];
        acc.push(...rows.map((a) => a.id));
        if (rows.length < pageSize) break;
        rangeFrom += pageSize;
      }
      albumIds = acc;
    } else if (year != null) {
      const acc: string[] = [];
      let rangeFrom = 0;
      const pageSize = 1000;
      for (;;) {
        const { data: albums, error } = await supabase
          .from("albums")
          .select("id")
          .like("release_date", `${year}%`)
          .range(rangeFrom, rangeFrom + pageSize - 1);
        if (error) break;
        const rows = albums ?? [];
        acc.push(...rows.map((a) => a.id));
        if (rows.length < pageSize) break;
        rangeFrom += pageSize;
      }
      albumIds = acc;
    } else if (decade != null) {
      const yearNum = decade + 10;
      const acc: string[] = [];
      let rangeFrom = 0;
      const pageSize = 1000;
      for (;;) {
        const { data: albums, error } = await supabase
          .from("albums")
          .select("id")
          .gte("release_date", `${decade}-01-01`)
          .lt("release_date", `${yearNum}-01-01`)
          .range(rangeFrom, rangeFrom + pageSize - 1);
        if (error) break;
        const rows = albums ?? [];
        acc.push(...rows.map((a) => a.id));
        if (rows.length < pageSize) break;
        rangeFrom += pageSize;
      }
      albumIds = acc;
    }

    if (albumIds !== null && albumIds.length === 0) return [];

    // ------------------------ Most Favorited (albums via entity_stats) ------------------------
    // favorite_count must be synced from user_favorite_albums via
    // sync_favorite_counts_from_user_favorite_albums (Supabase migration 050 + cron).
    // Matches Next.js `lib/queries.getLeaderboard`.
    // Currently only supports albums; ignore entity parameter for this type.
    if (type === "mostFavorited") {
      let statsQuery = supabase
        .from("entity_stats")
        .select("entity_id, favorite_count, play_count, avg_rating")
        .eq("entity_type", "album")
        .order("favorite_count", { ascending: false })
        .order("play_count", { ascending: false })
        .limit(Math.max(limit * 2, 100));

      if (albumIds && albumIds.length > 0) {
        statsQuery = statsQuery.in("entity_id", albumIds);
      }

      const { data: statsRows, error: statsError } = await statsQuery;
      if (statsError || !statsRows?.length) return [];

      const albumIdsFromStats = statsRows.map((r) => r.entity_id as string);
      const { data: albumRows } = await supabase
        .from("albums")
        .select("id, name, artist_id, image_url")
        .in("id", albumIdsFromStats);

      const albumsArray = (albumRows ?? []) as {
        id: string;
        name: string;
        artist_id: string;
        image_url: string | null;
      }[];
      const albumMap = new Map(albumsArray.map((a) => [a.id, a]));
      const artistIds = [...new Set(albumsArray.map((a) => a.artist_id))];
      const { data: artistRows } = await supabase
        .from("artists")
        .select("id, name")
        .in("id", artistIds);
      const artistMap = new Map(
        (artistRows ?? []).map((a) => [a.id, a.name]),
      );

      const entries: LeaderboardEntry[] = statsRows
        .map((row): LeaderboardEntry | null => {
          const album = albumMap.get(row.entity_id as string);
          if (!album) return null;
          const total_plays = row.play_count ?? 0;
          const average_rating =
            row.avg_rating != null ? Number(row.avg_rating) : null;
          const artistName = artistMap.get(album.artist_id) ?? "Unknown";
          return {
            entity_type: "album",
            id: row.entity_id as string,
            name: album.name,
            artist: artistName,
            artwork_url: album.image_url ?? null,
            total_plays,
            average_rating,
            favorite_count: row.favorite_count ?? 0,
          };
        })
        .filter((x): x is LeaderboardEntry => x != null);

      return entries.slice(0, limit);
    }

    // ---------------- Popular / Top Rated ----------------
    if (entity === "song") {
      let statsRows: {
        track_id: string;
        listen_count: number;
        avg_rating: number | null;
      }[];

      if (albumIds && albumIds.length > 0) {
        // Correct chunking for large IN lists (Supabase / PostgREST limits)
        const trackIds: string[] = [];
        const CHUNK = 100;
        for (let i = 0; i < albumIds.length; i += CHUNK) {
          const slice = albumIds.slice(i, i + CHUNK);
          const { data: songs } = await supabase
            .from("tracks")
            .select("id")
            .in("album_id", slice);
          if (songs) trackIds.push(...songs.map((s) => s.id));
        }

        if (trackIds.length === 0) return [];

        const statsRowsMerged: any[] = [];
        for (let i = 0; i < trackIds.length; i += CHUNK) {
          const slice = trackIds.slice(i, i + CHUNK);
          const { data: rows } = await supabase
            .from("track_stats")
            .select("track_id, listen_count, avg_rating")
            .in("track_id", slice);
          if (rows) statsRowsMerged.push(...rows);
        }
        if (statsRowsMerged.length === 0) return [];
        statsRows = statsRowsMerged;
      } else {
        const { data: rows, error: statsError } = await supabase
          .from("track_stats")
          .select("track_id, listen_count, avg_rating")
          .order("listen_count", { ascending: false })
          .limit(500);
        if (statsError || !rows?.length) return [];
        statsRows = rows as {
          track_id: string;
          listen_count: number;
          avg_rating: number | null;
        }[];
      }

      const { data: songRows } = await supabase
        .from("tracks")
        .select("id, name, album_id, artist_id")
        .in(
          "id",
          statsRows.map((r) => r.track_id),
        );

      const songArray =
        (songRows ?? []) as {
          id: string;
          name: string;
          album_id: string;
          artist_id: string;
        }[];
      const songMap = new Map(songArray.map((s) => [s.id, s]));
      const albumIdsForSongs = [...new Set(songArray.map((s) => s.album_id))];
      const artistIds = [...new Set(songArray.map((s) => s.artist_id))];

      const [{ data: albumRows }, { data: artistRows }] = await Promise.all([
        supabase
          .from("albums")
          .select("id, image_url")
          .in("id", albumIdsForSongs),
        supabase
          .from("artists")
          .select("id, name")
          .in("id", artistIds),
      ]);

      const albumMap = new Map(
        (albumRows ?? []).map((a: { id: string; image_url: string | null }) => [
          a.id,
          a.image_url ?? null,
        ]),
      );
      const artistMap = new Map(
        (artistRows ?? []).map(
          (a: { id: string; name: string }) => [a.id, a.name] as const,
        ),
      );

      const entries: LeaderboardEntry[] = statsRows
        .map((row) => {
          const song = songMap.get(row.track_id);
          if (!song) return null;
          const artistName = artistMap.get(song.artist_id) ?? "Unknown";
          const total_plays = row.listen_count ?? 0;
          const average_rating =
            row.avg_rating != null ? Number(row.avg_rating) : null;
          const weighted_score =
            type === "topRated" && average_rating != null
              ? average_rating * Math.log10(1 + total_plays)
              : undefined;
          const artwork_url = albumMap.get(song.album_id) ?? null;
          return {
            entity_type: "song",
            id: song.id,
            name: song.name,
            artist: artistName,
            artwork_url,
            total_plays,
            average_rating,
            ...(weighted_score !== undefined && { weighted_score }),
          };
        })
        .filter((x): x is LeaderboardEntry => x != null);

      if (type === "popular") {
        entries.sort((a, b) => b.total_plays - a.total_plays);
      } else {
        entries.sort((a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0));
      }

      return entries.slice(0, limit);
    }

    // entity === "album"
    // Use album_stats for popularity / rating.
    const albumStatsLimit = 500;
    let albumStatsRows:
      | {
          album_id: string;
          listen_count: number;
          avg_rating: number | null;
        }[]
      | null = null;

    if (albumIds && albumIds.length > 0) {
      const albumStatsRowsMerged: any[] = [];
      const CHUNK = 100;
      for (let i = 0; i < albumIds.length; i += CHUNK) {
        const slice = albumIds.slice(i, i + CHUNK);
        const { data: rows } = await supabase
          .from("album_stats")
          .select("album_id, listen_count, avg_rating")
          .in("album_id", slice);
        if (rows) albumStatsRowsMerged.push(...rows);
      }
      if (albumStatsRowsMerged.length === 0) return [];
      albumStatsRows = albumStatsRowsMerged;
    } else {
      const { data: rows, error: statsError } = await supabase
        .from("album_stats")
        .select("album_id, listen_count, avg_rating")
        .order("listen_count", { ascending: false })
        .limit(albumStatsLimit);
      if (statsError || !rows?.length) return [];
      albumStatsRows = rows as {
        album_id: string;
        listen_count: number;
        avg_rating: number | null;
      }[];
    }

    const albumIdsFromStats = albumStatsRows.map((r) => r.album_id);
    const { data: albumRows } = await supabase
      .from("albums")
      .select("id, name, artist_id, image_url")
      .in("id", albumIdsFromStats);

    const albumsArray =
      (albumRows ?? []) as {
        id: string;
        name: string;
        artist_id: string;
        image_url: string | null;
      }[];
    const albumMapFull = new Map(albumsArray.map((a) => [a.id, a]));
    const artistIdsForAlbums = [...new Set(albumsArray.map((a) => a.artist_id))];

    const { data: artistRows } = await supabase
      .from("artists")
      .select("id, name")
      .in("id", artistIdsForAlbums);
    const artistMap = new Map(
      (artistRows ?? []).map(
        (a: { id: string; name: string }) => [a.id, a.name] as const,
      ),
    );

    const albumEntries: LeaderboardEntry[] = albumStatsRows
      .map((row) => {
        const album = albumMapFull.get(row.album_id);
        if (!album) return null;
        const artistName = artistMap.get(album.artist_id) ?? "Unknown";
        const total_plays = row.listen_count ?? 0;
        const average_rating =
          row.avg_rating != null ? Number(row.avg_rating) : null;
        const weighted_score =
          type === "topRated" && average_rating != null
            ? average_rating * Math.log10(1 + total_plays)
            : undefined;
        return {
          entity_type: "album",
          id: album.id,
          name: album.name,
          artist: artistName,
          artwork_url: album.image_url ?? null,
          total_plays,
          average_rating,
          ...(weighted_score !== undefined && { weighted_score }),
        };
      })
      .filter((x): x is LeaderboardEntry => x != null);

    if (type === "popular") {
      albumEntries.sort((a, b) => b.total_plays - a.total_plays);
    } else {
      albumEntries.sort(
        (a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0),
      );
    }

    return albumEntries.slice(0, limit);
  } catch (e) {
    console.error("[queries] getLeaderboard failed:", e);
    return [];
  }
}
