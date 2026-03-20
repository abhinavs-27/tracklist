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
      const { data: albums } = await supabase
        .from("albums")
        .select("id, release_date")
        .gte("release_date", `${from}-01-01`)
        .lte("release_date", `${to}-12-31`);
      albumIds = (albums ?? []).map((a) => a.id);
    } else if (year != null) {
      const { data: albums } = await supabase
        .from("albums")
        .select("id")
        .like("release_date", `${year}%`);
      albumIds = (albums ?? []).map((a) => a.id);
    } else if (decade != null) {
      const { data: albums } = await supabase
        .from("albums")
        .select("id, release_date");
      const yearNum = decade + 10;
      albumIds = (albums ?? [])
        .filter((a) => {
          const y = a.release_date
            ? parseInt(a.release_date.slice(0, 4), 10)
            : NaN;
          return !isNaN(y) && y >= decade && y < yearNum;
        })
        .map((a) => a.id);
    }

    if (albumIds !== null && albumIds.length === 0) return [];

    // ------------------------ Most Favorited (albums via user_favorite_albums) ------------------------
    // Currently only supports albums; ignore entity parameter for this type.
    if (type === "mostFavorited") {
      let allowedAlbumIds: string[] | null = null;
      if (albumIds && albumIds.length > 0) {
        allowedAlbumIds = albumIds;
        if (allowedAlbumIds.length === 0) return [];
      }

      let favQuery = supabase
        .from("user_favorite_albums")
        .select("album_id, user_id");

      if (allowedAlbumIds) {
        favQuery = favQuery.in("album_id", allowedAlbumIds);
      }

      const { data: favRows, error: favError } = await favQuery;
      if (favError || !favRows?.length) return [];

      const favoriteCounts = new Map<string, number>();
      for (const row of favRows as { album_id: string; user_id: string }[]) {
        const current = favoriteCounts.get(row.album_id) ?? 0;
        favoriteCounts.set(row.album_id, current + 1);
      }
      const favAlbumIds = Array.from(favoriteCounts.keys());

      const [{ data: albumRows }, { data: statsRows }] = await Promise.all([
        supabase
          .from("albums")
          .select("id, name, artist_id, image_url")
          .in("id", favAlbumIds),
        supabase
          .from("album_stats")
          .select("album_id, listen_count, avg_rating")
          .in("album_id", favAlbumIds),
      ]);

      type StatsRow = {
        album_id: string;
        listen_count: number;
        avg_rating: number | null;
      };
      type AlbumRow = {
        id: string;
        name: string;
        artist_id: string;
        image_url: string | null;
      };
      type ArtistRow = { id: string; name: string };

      const statsMap = new Map(
        (statsRows ?? []).map((r: StatsRow) => [r.album_id, r]),
      );
      const albumArray = (albumRows ?? []) as AlbumRow[];
      const albumMap = new Map(albumArray.map((a) => [a.id, a]));
      const artistIds = [...new Set(albumArray.map((a) => a.artist_id))];
      const { data: artistRows } = await supabase
        .from("artists")
        .select("id, name")
        .in("id", artistIds);
      const artistMap = new Map(
        ((artistRows ?? []) as ArtistRow[]).map((a) => [a.id, a.name]),
      );

      const entries: LeaderboardEntry[] = favAlbumIds
        .map((id): LeaderboardEntry | null => {
          const album = albumMap.get(id);
          if (!album) return null;
          const stats = statsMap.get(id);
          const total_plays = stats?.listen_count ?? 0;
          const average_rating =
            stats?.avg_rating != null ? Number(stats.avg_rating) : null;
          const artistName = artistMap.get(album.artist_id) ?? "Unknown";
          const favorite_count = favoriteCounts.get(id) ?? 0;
          return {
            entity_type: "album",
            id,
            name: album.name,
            artist: artistName,
            artwork_url: album.image_url ?? null,
            total_plays,
            average_rating,
            favorite_count,
          };
        })
        .filter((x): x is LeaderboardEntry => x != null);

      entries.sort((a, b) => {
        if ((b.favorite_count ?? 0) !== (a.favorite_count ?? 0)) {
          return (b.favorite_count ?? 0) - (a.favorite_count ?? 0);
        }
        return b.total_plays - a.total_plays;
      });

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
        const { data: songs } = await supabase
          .from("songs")
          .select("id")
          .in("album_id", albumIds);
        const trackIds = (songs ?? []).map((s) => s.id);
        if (trackIds.length === 0) return [];
        const { data: rows, error: statsError } = await supabase
          .from("track_stats")
          .select("track_id, listen_count, avg_rating")
          .in("track_id", trackIds);
        if (statsError || !rows?.length) return [];
        statsRows = rows as {
          track_id: string;
          listen_count: number;
          avg_rating: number | null;
        }[];
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
        .from("songs")
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
      const { data: rows, error: statsError } = await supabase
        .from("album_stats")
        .select("album_id, listen_count, avg_rating")
        .in("album_id", albumIds);
      if (statsError || !rows?.length) return [];
      albumStatsRows = rows as {
        album_id: string;
        listen_count: number;
        avg_rating: number | null;
      }[];
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
