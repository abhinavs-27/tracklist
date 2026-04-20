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
  offset?: number;
  skipLeaderboardRpc?: boolean;
};

type AlbumStatRow = {
  album_id: string;
  listen_count: number;
  avg_rating: number | null;
};

const TRACK_STATS_CHUNK = 120;
const LEADERBOARD_ALBUM_IN_CHUNK = 120;

/** Mirrors lib/queries.ts */
async function fetchAlbumStatsMapForLeaderboard(
  supabase: ReturnType<typeof getSupabase>,
  albumIds: string[],
): Promise<Map<string, { listen_count: number; avg_rating: number | null }>> {
  const map = new Map<
    string,
    { listen_count: number; avg_rating: number | null }
  >();
  if (albumIds.length === 0) return map;
  for (let i = 0; i < albumIds.length; i += LEADERBOARD_ALBUM_IN_CHUNK) {
    const chunk = albumIds.slice(i, i + LEADERBOARD_ALBUM_IN_CHUNK);
    const { data: rows, error } = await supabase
      .from("album_stats")
      .select("album_id, listen_count, avg_rating")
      .in("album_id", chunk);
    if (error) {
      console.warn("[leaderboardService] fetchAlbumStatsMapForLeaderboard", error.message);
      continue;
    }
    for (const r of rows ?? []) {
      const row = r as AlbumStatRow;
      map.set(row.album_id, {
        listen_count: Number(row.listen_count ?? 0),
        avg_rating: row.avg_rating != null ? Number(row.avg_rating) : null,
      });
    }
  }
  return map;
}

async function sumTrackListenCountsByAlbumIds(
  supabase: ReturnType<typeof getSupabase>,
  albumIds: string[],
): Promise<Map<string, number>> {
  const sums = new Map<string, number>();
  if (albumIds.length === 0) return sums;
  for (let i = 0; i < albumIds.length; i += LEADERBOARD_ALBUM_IN_CHUNK) {
    const chunk = albumIds.slice(i, i + LEADERBOARD_ALBUM_IN_CHUNK);
    const { data: tracks } = await supabase
      .from("tracks")
      .select("id, album_id")
      .in("album_id", chunk);
    if (!tracks?.length) continue;
    const trackToAlbum = new Map(
      (tracks as { id: string; album_id: string }[]).map((t) => [
        t.id,
        t.album_id,
      ]),
    );
    const trackIds = [...trackToAlbum.keys()];
    for (let j = 0; j < trackIds.length; j += TRACK_STATS_CHUNK) {
      const sl = trackIds.slice(j, j + TRACK_STATS_CHUNK);
      const { data: statRows } = await supabase
        .from("track_stats")
        .select("track_id, listen_count")
        .in("track_id", sl);
      for (const r of statRows ?? []) {
        const tr = r as { track_id: string; listen_count: number | null };
        const aid = trackToAlbum.get(tr.track_id);
        if (!aid) continue;
        sums.set(
          aid,
          (sums.get(aid) ?? 0) + Number(tr.listen_count ?? 0),
        );
      }
    }
  }
  return sums;
}

/** See lib/queries.ts — fallback when `album_stats` is empty. */
async function getAlbumLeaderboardFromEntityStatsFallback(
  supabase: ReturnType<typeof getSupabase>,
  type: "popular" | "topRated",
  albumIdsFilter: string[] | null,
  limit: number,
): Promise<LeaderboardEntry[]> {
  const entityStatsCap = Math.max(
    type === "popular" ? Math.min(5000, limit * 80) : limit * 4,
    200,
  );
  let statsQuery = supabase
    .from("entity_stats")
    .select("entity_id, play_count, avg_rating, favorite_count")
    .eq("entity_type", "album")
    .limit(entityStatsCap);

  if (albumIdsFilter && albumIdsFilter.length > 0) {
    statsQuery = statsQuery.in("entity_id", albumIdsFilter);
  }

  if (type === "popular") {
    statsQuery = statsQuery
      .order("play_count", { ascending: false })
      .order("favorite_count", { ascending: false });
  } else {
    statsQuery = statsQuery
      .order("avg_rating", { ascending: false, nullsFirst: false })
      .order("play_count", { ascending: false });
  }

  const { data: statsRows, error: statsError } = await statsQuery;
  if (statsError || !statsRows?.length) return [];

  const albumIdsFromStats = statsRows.map((r) => r.entity_id as string);
  const [albumStatsMap, trackListenByAlbum] = await Promise.all([
    fetchAlbumStatsMapForLeaderboard(supabase, albumIdsFromStats),
    sumTrackListenCountsByAlbumIds(supabase, albumIdsFromStats),
  ]);

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
    (artistRows ?? []).map((a) => [a.id, a.name] as const),
  );

  const albumEntries: LeaderboardEntry[] = statsRows
    .map((row): LeaderboardEntry | null => {
      const aid = row.entity_id as string;
      const album = albumMap.get(aid);
      if (!album) return null;
      const fromAlbum = albumStatsMap.get(aid);
      const entityPlays = Number(row.play_count ?? 0);
      const trackSum = trackListenByAlbum.get(aid) ?? 0;
      const total_plays = Math.max(
        fromAlbum?.listen_count ?? 0,
        entityPlays,
        trackSum,
      );
      const average_rating =
        fromAlbum?.avg_rating ??
        (row.avg_rating != null ? Number(row.avg_rating) : null);
      const weighted_score =
        type === "topRated" && average_rating != null
          ? average_rating * Math.log10(1 + total_plays)
          : undefined;
      return {
        entity_type: "album",
        id: album.id,
        name: album.name,
        artist: artistMap.get(album.artist_id) ?? "Unknown",
        artwork_url: album.image_url ?? null,
        total_plays,
        average_rating,
        ...(weighted_score !== undefined && { weighted_score }),
      };
    })
    .filter((x): x is LeaderboardEntry => x != null);

  if (type === "popular") {
    albumEntries.sort((a, b) => b.total_plays - a.total_plays);
    const withPlays = albumEntries.filter((a) => a.total_plays > 0);
    return withPlays.slice(0, limit);
  }

  albumEntries.sort(
    (a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0),
  );

  return albumEntries.slice(0, limit);
}

async function getLeaderboardFromRpc(
  supabase: ReturnType<typeof getSupabase>,
  type: "popular" | "topRated",
  entity: "song" | "album",
  limit: number,
  offset: number,
): Promise<{ entries: LeaderboardEntry[]; totalCount: number } | null> {
  const p_metric = type === "popular" ? "popular" : "top_rated";
  const rpcName =
    entity === "album" ? "get_leaderboard_albums" : "get_leaderboard_tracks";
  const { data, error } = await supabase.rpc(rpcName, {
    p_metric,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    console.warn("[leaderboardService] getLeaderboardFromRpc", rpcName, error.message);
    return null;
  }
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) {
    return { entries: [], totalCount: 0 };
  }
  const totalCount = Number(rows[0].total_count ?? 0);
  if (entity === "album") {
    const entries: LeaderboardEntry[] = rows.map((row) => {
      const listen = Number(row.listen_count ?? 0);
      const average_rating =
        row.avg_rating != null ? Number(row.avg_rating) : null;
      const weighted_score =
        type === "topRated" && average_rating != null
          ? average_rating * Math.log10(1 + listen)
          : undefined;
      return {
        entity_type: "album",
        id: String(row.album_id),
        name: String(row.album_name ?? ""),
        artist: String(row.artist_name ?? "Unknown"),
        artwork_url: (row.image_url as string | null) ?? null,
        total_plays: listen,
        average_rating,
        ...(weighted_score !== undefined && { weighted_score }),
      };
    });
    return { entries, totalCount };
  }
  const entries: LeaderboardEntry[] = rows.map((row) => {
    const listen = Number(row.listen_count ?? 0);
    const average_rating =
      row.avg_rating != null ? Number(row.avg_rating) : null;
    const weighted_score =
      type === "topRated" && average_rating != null
        ? average_rating * Math.log10(1 + listen)
        : undefined;
    return {
      entity_type: "song",
      id: String(row.track_id),
      name: String(row.track_name ?? ""),
      artist: String(row.artist_name ?? "Unknown"),
      artwork_url: (row.image_url as string | null) ?? null,
      total_plays: listen,
      average_rating,
      ...(weighted_score !== undefined && { weighted_score }),
    };
  });
  return { entries, totalCount };
}

export async function getLeaderboardWithTotal(
  type: "popular" | "topRated" | "mostFavorited",
  filters: LeaderboardFilters,
  entity: "song" | "album",
  limit: number,
  offset: number,
): Promise<{ entries: LeaderboardEntry[]; totalCount: number | null }> {
  const supabase = getSupabase();
  const off = Math.max(0, offset);
  if (
    (type === "popular" || type === "topRated") &&
    filters.startYear == null &&
    filters.endYear == null &&
    filters.year == null &&
    filters.decade == null
  ) {
    const rpc = await getLeaderboardFromRpc(supabase, type, entity, limit, off);
    if (rpc !== null) {
      return { entries: rpc.entries, totalCount: rpc.totalCount };
    }
  }
  const need = Math.min(off + limit, 1000);
  const all = await getLeaderboard(
    type,
    { ...filters, skipLeaderboardRpc: true },
    entity,
    need,
  );
  return {
    entries: all.slice(off, off + limit),
    totalCount: null,
  };
}

export async function getLeaderboard(
  type: "popular" | "topRated" | "mostFavorited",
  filters: LeaderboardFilters,
  entity: "song" | "album" = "song",
  limit = 50,
): Promise<LeaderboardEntry[]> {
  try {
    const supabase = getSupabase();
    const { year, decade, startYear, endYear, skipLeaderboardRpc } = filters;

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
          .range(rangeFrom, rangeFrom + pageSize - 1)
          .limit(pageSize);
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
          .range(rangeFrom, rangeFrom + pageSize - 1)
          .limit(pageSize);
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
          .range(rangeFrom, rangeFrom + pageSize - 1)
          .limit(pageSize);
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
      const [albumStatsMap, trackListenByAlbum] = await Promise.all([
        fetchAlbumStatsMapForLeaderboard(supabase, albumIdsFromStats),
        sumTrackListenCountsByAlbumIds(supabase, albumIdsFromStats),
      ]);

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
          const aid = row.entity_id as string;
          const album = albumMap.get(aid);
          if (!album) return null;
          const fromAlbum = albumStatsMap.get(aid);
          const entityPlays = Number(row.play_count ?? 0);
          const trackSum = trackListenByAlbum.get(aid) ?? 0;
          const total_plays = Math.max(
            fromAlbum?.listen_count ?? 0,
            entityPlays,
            trackSum,
          );
          const average_rating =
            fromAlbum?.avg_rating ??
            (row.avg_rating != null ? Number(row.avg_rating) : null);
          const artistName = artistMap.get(album.artist_id) ?? "Unknown";
          return {
            entity_type: "album",
            id: aid,
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
    if (
      !skipLeaderboardRpc &&
      (type === "popular" || type === "topRated") &&
      albumIds === null
    ) {
      const off = Math.max(0, filters.offset ?? 0);
      const rpc = await getLeaderboardFromRpc(
        supabase,
        type,
        entity,
        limit,
        off,
      );
      if (rpc !== null) return rpc.entries;
    }

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
            .in("album_id", slice)
            .limit(1000);
          if (songs) trackIds.push(...songs.map((s) => s.id));
        }

        if (trackIds.length === 0) return [];

        const statsRowsMerged: any[] = [];
        for (let i = 0; i < trackIds.length; i += CHUNK) {
          const slice = trackIds.slice(i, i + CHUNK);
          const { data: rows } = await supabase
            .from("track_stats")
            .select("track_id, listen_count, avg_rating")
            .in("track_id", slice)
            .limit(CHUNK);
          if (rows) statsRowsMerged.push(...rows);
        }
        if (statsRowsMerged.length === 0) return [];
        statsRows = statsRowsMerged;
      } else {
        const { data: rows, error: statsError } = await supabase
          .from("track_stats")
          .select("track_id, listen_count, avg_rating")
          .order("listen_count", { ascending: false })
          .limit(limit * 4 || 500);
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
        return entries.filter((a) => a.total_plays > 0).slice(0, limit);
      }

      entries.sort(
        (a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0),
      );

      return entries.slice(0, limit);
    }

    // entity === "album" — prefer album_stats; fall back to entity_stats (see lib/queries).
    const albumStatsLimit = type === "popular" ? 2000 : 500;
    let albumStatsRows: AlbumStatRow[] | null = null;

    if (albumIds && albumIds.length > 0) {
      const albumStatsRowsMerged: AlbumStatRow[] = [];
      const CHUNK = 100;
      for (let i = 0; i < albumIds.length; i += CHUNK) {
        const slice = albumIds.slice(i, i + CHUNK);
        const { data: rows, error: statsError } = await supabase
          .from("album_stats")
          .select("album_id, listen_count, avg_rating")
          .in("album_id", slice)
          .limit(CHUNK);
        if (statsError) {
          return getAlbumLeaderboardFromEntityStatsFallback(
            supabase,
            type,
            albumIds,
            limit,
          );
        }
        if (rows) albumStatsRowsMerged.push(...(rows as AlbumStatRow[]));
      }
      const filtered =
        type === "popular"
          ? albumStatsRowsMerged.filter(
              (r) => Number(r.listen_count ?? 0) > 0,
            )
          : albumStatsRowsMerged;
      if (filtered.length === 0) {
        return getAlbumLeaderboardFromEntityStatsFallback(
          supabase,
          type,
          albumIds,
          limit,
        );
      }
      albumStatsRows = filtered;
    } else {
      let albumStatsQuery = supabase
        .from("album_stats")
        .select("album_id, listen_count, avg_rating")
        .order("listen_count", { ascending: false })
        .limit(albumStatsLimit);
      if (type === "popular") {
        albumStatsQuery = albumStatsQuery.gt("listen_count", 0);
      }
      const { data: rows, error: statsError } = await albumStatsQuery;
      if (statsError || !rows?.length) {
        return getAlbumLeaderboardFromEntityStatsFallback(
          supabase,
          type,
          null,
          limit,
        );
      }
      albumStatsRows = rows as AlbumStatRow[];
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

    let albumEntries: LeaderboardEntry[] = albumStatsRows
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

    if (albumEntries.length === 0) {
      return getAlbumLeaderboardFromEntityStatsFallback(
        supabase,
        type,
        albumIds,
        limit,
      );
    }

    if (type === "popular") {
      albumEntries.sort((a, b) => b.total_plays - a.total_plays);
      return albumEntries
        .filter((a) => a.total_plays > 0)
        .slice(0, limit);
    }

    albumEntries.sort(
      (a, b) => (b.weighted_score ?? 0) - (a.weighted_score ?? 0),
    );

    return albumEntries.slice(0, limit);
  } catch (e) {
    console.error("[queries] getLeaderboard failed:", e);
    return [];
  }
}
