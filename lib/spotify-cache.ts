import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { logPerf, timeAsync } from "@/lib/profiling";
import { SpotifyIntegrationDisabledError } from "@/lib/spotify-integration-enabled";
import {
  getAlbum,
  getAlbumTracks,
  getAlbums,
  getArtist,
  getArtistAlbums,
  getArtistTopTracks,
  getArtists,
  getTrack,
  getTracks,
} from "@/lib/spotify";

const LOG_PREFIX = "[spotify-cache]";

/** TTL for cached Spotify data: refresh if older than this (default 30 days). */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** In-memory dedupe: same batch requested again within 5s returns cached (e.g. during one render). */
const BATCH_MEMORY_TTL_MS = 5000;
const batchMemoryCache = new Map<string, { data: Map<string, unknown>; at: number }>();
function getBatchCacheKey(prefix: string, ids: string[]): string {
  return `${prefix}:${[...new Set(ids)].filter(Boolean).sort().join(",")}`;
}
function getFromBatchMemoryMap(key: string): Map<string, unknown> | null {
  const entry = batchMemoryCache.get(key);
  if (!entry || Date.now() - entry.at > BATCH_MEMORY_TTL_MS) {
    if (entry) batchMemoryCache.delete(key);
    return null;
  }
  return entry.data;
}
function setBatchMemoryMap(key: string, data: Map<string, unknown>): void {
  batchMemoryCache.set(key, { data, at: Date.now() });
  if (batchMemoryCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of batchMemoryCache.entries()) {
      if (now - v.at > BATCH_MEMORY_TTL_MS) batchMemoryCache.delete(k);
    }
  }
}

function logCacheMiss(entity: string, id: string) {
  console.log(`${LOG_PREFIX} cache miss: ${entity} id=${id}`);
}

function logUpsert(_entity: string, _id: string) {
  // No-op by default; set SPOTIFY_CACHE_LOG_UPSERT=1 to debug
  if (process.env.SPOTIFY_CACHE_LOG_UPSERT === "1") {
    console.log(`${LOG_PREFIX} upsert: ${_entity} id=${_id}`);
  }
}

function isCacheStale(cachedAt: string | null | undefined): boolean {
  if (!cachedAt) return true;
  return Date.now() - new Date(cachedAt).getTime() > CACHE_TTL_MS;
}

// --- DB row types (match 009_spotify_entities + 035_spotify_cached_at)

type ArtistRow = {
  id: string;
  name: string;
  image_url: string | null;
  genres: string[] | null;
  popularity?: number | null;
  created_at: string;
  updated_at: string;
  cached_at?: string | null;
};

type AlbumRow = {
  id: string;
  name: string;
  artist_id: string;
  image_url: string | null;
  release_date: string | null;
  total_tracks: number | null;
  created_at: string;
  updated_at: string;
  cached_at?: string | null;
};

type SongRow = {
  id: string;
  name: string;
  album_id: string;
  artist_id: string;
  duration_ms: number | null;
  track_number: number | null;
  popularity?: number | null;
  created_at: string;
  updated_at: string;
  cached_at?: string | null;
};

// --- Helpers: upsert from Spotify payloads

function clampPopularity(n: number): number {
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Spotify typings omit `popularity` on some builds; API returns it for full artists. */
type ArtistWithPopularity = SpotifyApi.ArtistObjectFull & {
  popularity?: number;
};

export async function upsertArtistFromSpotify(
  supabase: SupabaseClient,
  a: SpotifyApi.ArtistObjectFull | SpotifyApi.ArtistObjectSimplified,
  options?: {
    /** Full Spotify payload: skip read-before-write (halves DB round-trips for batch backfills). */
    skipMerge?: boolean;
  },
) {
  const now = new Date().toISOString();

  type ArtistMergeRow = {
    genres: string[] | null;
    popularity: number | null;
    image_url: string | null;
  };

  let ex: ArtistMergeRow | null = null;

  if (!options?.skipMerge) {
    const { data: existing } = await supabase
      .from("artists")
      .select("genres, popularity, image_url")
      .eq("id", a.id)
      .maybeSingle();
    ex = existing as ArtistMergeRow | null;
  }

  const newGenres =
    "genres" in a && Array.isArray(a.genres) && a.genres.length > 0
      ? a.genres
      : ex?.genres ?? null;

  const ap = a as ArtistWithPopularity;
  const newPop =
    typeof ap.popularity === "number"
      ? clampPopularity(ap.popularity)
      : ex?.popularity ?? null;

  const newImage =
    "images" in a && a.images?.[0]?.url
      ? a.images[0].url
      : ex?.image_url ?? null;

  const row = {
    id: a.id,
    name: a.name,
    image_url: newImage,
    genres: newGenres,
    popularity: newPop,
    updated_at: now,
    cached_at: now,
  };

  const { error } = await supabase.from("artists").upsert(row, {
    onConflict: "id",
  });
  if (error) {
    console.error(`${LOG_PREFIX} artists upsert failed`, error);
    throw new Error(`artists upsert: ${error.message}`);
  }

  logUpsert("artist", a.id);
}

export async function upsertAlbumFromSpotify(
  supabase: SupabaseClient,
  album: SpotifyApi.AlbumObjectFull | SpotifyApi.AlbumObjectSimplified,
) {
  const first = album.artists?.[0];
  if (!first) throw new Error("Album has no artist");

  // ensure primary artist exists
  await upsertArtistFromSpotify(supabase, first);

  const now = new Date().toISOString();
  const row = {
    id: album.id,
    name: album.name,
    artist_id: first.id,
    image_url: album.images?.[0]?.url ?? null,
    release_date: "release_date" in album ? album.release_date ?? null : null,
    total_tracks:
      "total_tracks" in album ? album.total_tracks ?? null : null,
    updated_at: now,
    cached_at: now,
  };

  const { error } = await supabase.from("albums").upsert(row, {
    onConflict: "id",
  });
  if (error) {
    console.error(`${LOG_PREFIX} albums upsert failed`, error);
    throw new Error(`albums upsert: ${error.message}`);
  }

  logUpsert("album", album.id);
}

export async function upsertTrackFromSpotify(
  supabase: SupabaseClient,
  track: SpotifyApi.TrackObjectFull | SpotifyApi.TrackObjectSimplified,
  albumId: string,
  albumName: string,
  albumImageUrl: string | null,
  albumReleaseDate?: string,
) {
  const first = track.artists?.[0];
  if (!first) throw new Error("Track has no artist");

  await upsertArtistFromSpotify(supabase, first);

  const now = new Date().toISOString();
  const albumRow = {
    id: albumId,
    name: albumName,
    artist_id: first.id,
    image_url: albumImageUrl,
    release_date: albumReleaseDate ?? null,
    total_tracks: null,
    updated_at: now,
    cached_at: now,
  };

  const { error: albumErr } = await supabase.from("albums").upsert(albumRow, {
    onConflict: "id",
  });
  if (albumErr) {
    console.error(
      `${LOG_PREFIX} albums upsert (from track) failed`,
      albumErr,
    );
    throw new Error(`albums upsert (from track): ${albumErr.message}`);
  }
  logUpsert("album", albumId);

  const trackNumber =
    "track_number" in track
      ? (track as { track_number?: number }).track_number ?? null
      : null;

  const trackWithPop = track as SpotifyApi.TrackObjectFull & {
    popularity?: number;
  };
  const pop =
    typeof trackWithPop.popularity === "number"
      ? trackWithPop.popularity
      : null;

  const row = {
    id: track.id,
    name: track.name,
    album_id: albumId,
    artist_id: first.id,
    duration_ms: track.duration_ms ?? null,
    track_number: trackNumber,
    popularity: pop,
    updated_at: now,
    cached_at: now,
  };

  const { error } = await supabase.from("songs").upsert(row, {
    onConflict: "id",
  });
  if (error) {
    console.error(`${LOG_PREFIX} songs upsert failed`, error);
    throw new Error(`songs upsert: ${error.message}`);
  }

  logUpsert("song", track.id);
}

/** Upsert only the song row; album and artist must already exist. Used when hydrating a full album to avoid N duplicate album/artist upserts. */
async function upsertSongRowOnly(
  supabase: SupabaseClient,
  track: SpotifyApi.TrackObjectFull | SpotifyApi.TrackObjectSimplified,
  albumId: string,
  artistId: string,
) {
  const trackNumber =
    "track_number" in track
      ? (track as { track_number?: number }).track_number ?? null
      : null;
  const now = new Date().toISOString();
  const trackWithPop = track as SpotifyApi.TrackObjectFull & {
    popularity?: number;
  };
  const pop =
    typeof trackWithPop.popularity === "number"
      ? trackWithPop.popularity
      : null;

  const row = {
    id: track.id,
    name: track.name,
    album_id: albumId,
    artist_id: artistId,
    duration_ms: track.duration_ms ?? null,
    track_number: trackNumber,
    popularity: pop,
    updated_at: now,
    cached_at: now,
  };
  const { error } = await supabase.from("songs").upsert(row, {
    onConflict: "id",
  });
  if (error) {
    console.error(`${LOG_PREFIX} songs upsert failed`, error);
    throw new Error(`songs upsert: ${error.message}`);
  }
}

// --- getOrFetchArtist (DB-first cache + TTL)

async function getOrFetchArtistInner(id: string): Promise<SpotifyApi.ArtistObjectFull> {
  const supabase = await createSupabaseServerClient();

  const { data: row, error } = await supabase
    .from("artists")
    .select("id, name, image_url, genres, popularity, cached_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} artists select failed`, error);
  }

  if (row) {
    const a = row as unknown as ArtistRow;
    const cacheTime = a.cached_at ?? a.updated_at;
    const stale = isCacheStale(cacheTime);

    if (!stale && a.image_url) {
      return {
        id: a.id,
        name: a.name,
        images: [{ url: a.image_url }],
        genres: a.genres ?? undefined,
        popularity: typeof a.popularity === "number" ? a.popularity : 0,
        followers: { total: 0 },
      } as SpotifyApi.ArtistObjectFull;
    }
    if (!stale && !a.image_url) {
      try {
        const artist = await getArtist(id);
        try {
          await upsertArtistFromSpotify(supabase, artist);
        } catch (e) {
          console.error(`${LOG_PREFIX} upsertArtistFromSpotify (backfill image) error`, e);
        }
        return artist;
      } catch (e) {
        console.warn(`${LOG_PREFIX} getArtist (image backfill) failed, using cached data`, e);
      }
      return {
        id: a.id,
        name: a.name,
        images: undefined,
        genres: a.genres ?? undefined,
        popularity: typeof a.popularity === "number" ? a.popularity : 0,
        followers: { total: 0 },
      } as SpotifyApi.ArtistObjectFull;
    }
  }

  logCacheMiss("artist", id);

  const missStart = performance.now();
  try {
    const artist = await getArtist(id);
    try {
      await upsertArtistFromSpotify(supabase, artist);
    } catch (e) {
      console.error(`${LOG_PREFIX} upsertArtistFromSpotify error`, e);
    }
    logPerf("cache_miss", "artist", performance.now() - missStart, { id });
    return artist;
  } catch (e) {
    console.error(`${LOG_PREFIX} getArtist failed`, e);
    throw new Error(`Failed to fetch artist ${id} from Spotify`);
  }
}

export async function getOrFetchArtist(id: string): Promise<SpotifyApi.ArtistObjectFull> {
  return timeAsync("cache", "getOrFetchArtist", () => getOrFetchArtistInner(id), { id });
}

// --- getOrFetchArtistAlbums: fetch from Spotify, upsert albums (and artists)

export async function getOrFetchArtistAlbums(
  artistId: string,
  limit = 20,
): Promise<SpotifyApi.PagingObject<SpotifyApi.AlbumObjectSimplified>> {
  const supabase = await createSupabaseServerClient();

  try {
    const res = await getArtistAlbums(artistId, limit);

    for (const a of res.items ?? []) {
      try {
        await upsertAlbumFromSpotify(supabase, a);
      } catch (e) {
        console.error(
          `${LOG_PREFIX} upsertAlbumFromSpotify failed for album ${a.id}`,
          e,
        );
      }
    }

    return res;
  } catch (e) {
    console.error(`${LOG_PREFIX} getArtistAlbums failed`, e);
    return {
      items: [],
      total: 0,
      limit,
      offset: 0,
      next: null,
      previous: null,
    };
  }
}

// --- Top tracks from logs (no Spotify dependency)

export async function getArtistTopTracksFromLogs(
  artistId: string,
  limit = 10,
): Promise<SpotifyApi.TrackObjectFull[]> {
  const supabase = await createSupabaseServerClient();

  // 1) Pull a recent window of song logs and aggregate by track_id in code
  const { data: logRows, error: logsError } = await supabase
    .from("logs")
    .select("track_id")
    .order("listened_at", { ascending: false })
    .limit(500);

  if (logsError) {
    console.error(
      `${LOG_PREFIX} getArtistTopTracksFromLogs logs select failed`,
      logsError,
    );
    return [];
  }

  const logs = (logRows as { track_id: string }[] | null) ?? [];

  if (logs.length === 0) {
    console.log(
      "[logs-top-tracks] artistId=%s returned 0 tracks (no logs)",
      artistId,
    );
    return [];
  }

  const counts = new Map<string, number>();
  for (const l of logs) {
    counts.set(l.track_id, (counts.get(l.track_id) ?? 0) + 1);
  }

  // Sort track_ids by count desc and take a bit more than limit to allow filtering
  const sortedIds = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .slice(0, limit * 2);

  if (sortedIds.length === 0) {
    console.log(
      "[logs-top-tracks] artistId=%s returned 0 tracks (no song ids after aggregation)",
      artistId,
    );
    return [];
  }

  // 2) Try to resolve as many as possible from cached songs/albums
  const { data: songRows, error: songsError } = await supabase
    .from("songs")
    .select("id, name, album_id, artist_id, duration_ms")
    .in("id", sortedIds);

  if (songsError) {
    console.error(
      `${LOG_PREFIX} getArtistTopTracksFromLogs songs select failed`,
      songsError,
    );
  }

  const songs =
    (songRows as
      | {
          id: string;
          name: string;
          album_id: string;
          artist_id: string;
          duration_ms: number | null;
        }[]
      | null) ?? [];

  const songMap = new Map(songs.map((s) => [s.id, s]));
  const albumIds = [
    ...new Set(
      songs.map((s) => s.album_id).filter((id) => typeof id === "string"),
    ),
  ];

  let albumsMap = new Map<
    string,
    { id: string; name: string; image_url: string | null; release_date: string | null }
  >();
  if (albumIds.length > 0) {
    const { data: albumRows, error: albumsError } = await supabase
      .from("albums")
      .select("id, name, image_url, release_date")
      .in("id", albumIds);
    if (albumsError) {
      console.error(
        `${LOG_PREFIX} getArtistTopTracksFromLogs albums select failed`,
        albumsError,
      );
    } else {
      const arr =
        (albumRows as
          | {
              id: string;
              name: string;
              image_url: string | null;
              release_date: string | null;
            }[]
          | null) ?? [];
      albumsMap = new Map(arr.map((a) => [a.id, a]));
    }
  }

  // Load artist name for display
  let artistName = "";
  const { data: artistRow } = await supabase
    .from("artists")
    .select("id, name")
    .eq("id", artistId)
    .maybeSingle();
  if (artistRow && "name" in artistRow && artistRow.name) {
    artistName = (artistRow as { name: string }).name;
  }

  const tracks: SpotifyApi.TrackObjectFull[] = [];

  // 3) Build tracks in popularity order from local cache only (no Spotify top-tracks API)
  for (const trackId of sortedIds) {
    const song = songMap.get(trackId);
    if (!song || song.artist_id !== artistId) continue;

    const alb = albumsMap.get(song.album_id);
    const track: SpotifyApi.TrackObjectFull = {
      id: song.id,
      name: song.name,
      artists: [{ id: artistId, name: artistName }],
      duration_ms: song.duration_ms ?? undefined,
      album: alb
        ? {
            id: alb.id,
            name: alb.name,
            artists: artistName ? [{ id: artistId, name: artistName }] : [],
            images: alb.image_url ? [{ url: alb.image_url }] : undefined,
            release_date: alb.release_date ?? undefined,
          }
        : undefined,
    };
    tracks.push(track);
  }

  console.log(
    "[logs-top-tracks] artistId=%s returned %d tracks",
    artistId,
    tracks.length,
  );

  return tracks;
}

// --- getOrFetchArtistTopTracks: now uses logs only

export async function getOrFetchArtistTopTracks(
  artistId: string,
  limit = 10,
): Promise<{ tracks: SpotifyApi.TrackObjectFull[] }> {
  const tracks = await getArtistTopTracksFromLogs(artistId, limit);
  return { tracks };
}

// --- getOrFetchAlbum (lazy cache with tracks)

async function getOrFetchAlbumInner(id: string): Promise<{
  album: SpotifyApi.AlbumObjectFull;
  tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
}> {
  const supabase = await createSupabaseServerClient();

  const { data: albumRow, error: albumErr } = await supabase
    .from("albums")
    .select("id, name, artist_id, image_url, release_date, total_tracks, cached_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (albumErr) {
    console.error(`${LOG_PREFIX} albums select failed`, albumErr);
  }

  if (albumRow) {
    const album = albumRow as unknown as AlbumRow;
    const cacheTime = album.cached_at ?? album.updated_at;
    const stale = isCacheStale(cacheTime);

    if (!stale) {
      const { data: artistRow } = await supabase
        .from("artists")
        .select("id, name, image_url, genres")
        .eq("id", album.artist_id)
        .maybeSingle();
      const artist = artistRow as unknown as ArtistRow | null;

      const { data: songRows, error: songsErr } = await supabase
        .from("songs")
        .select("id, name, album_id, artist_id, duration_ms, track_number")
        .eq("album_id", id)
        .order("track_number", { ascending: true });

      if (songsErr) {
        console.error(`${LOG_PREFIX} songs select failed`, songsErr);
      }

      let songs = (songRows ?? []) as unknown as SongRow[];

      const totalTracks = album.total_tracks ?? 0;
      const needBackfill =
        songs.length === 0 ||
        (totalTracks > 0 && songs.length < totalTracks) ||
        (songs.length > 0 && totalTracks === 0);
      if (needBackfill) {
        try {
          const result = await refreshAlbumFromSpotify(supabase, id);
          if (result?.album && result?.tracks)
            return { album: result.album, tracks: result.tracks };
          const { data: refetched } = await supabase
            .from("songs")
            .select("id, name, album_id, artist_id, duration_ms, track_number, cached_at, updated_at")
            .eq("album_id", id)
            .order("track_number", { ascending: true });
          songs = (refetched ?? []) as unknown as SongRow[];
        } catch (e) {
          console.warn(`${LOG_PREFIX} album tracks backfill failed for ${id}`, e);
        }
      }

      const artistIds = [...new Set(songs.map((s) => s.artist_id))];
      const { data: artistRows, error: artistsErr } = await supabase
        .from("artists")
        .select("id, name")
        .in("id", artistIds.length ? artistIds : [album.artist_id]);

      if (artistsErr) {
        console.error(
          `${LOG_PREFIX} artists select for songs failed`,
          artistsErr,
        );
      }

      const artistMap = new Map(
        (artistRows ?? []).map((r: { id: string; name: string }) => [
          r.id,
          r.name,
        ]),
      );
      const artistName = artist?.name ?? artistMap.get(album.artist_id) ?? "";

      const albumPayload: SpotifyApi.AlbumObjectFull = {
        id: album.id,
        name: album.name,
        artists: [{ id: album.artist_id, name: artistName }],
        images: album.image_url ? [{ url: album.image_url }] : undefined,
        release_date: album.release_date ?? undefined,
        total_tracks: album.total_tracks ?? undefined,
        tracks: {
          items: songs.map<SpotifyApi.TrackObjectSimplified>((s) => ({
            id: s.id,
            name: s.name,
            artists: [
              {
                id: s.artist_id,
                name: artistMap.get(s.artist_id) ?? "",
              },
            ],
            duration_ms: s.duration_ms ?? undefined,
          })),
          total: songs.length,
          limit: songs.length,
          offset: 0,
          next: null,
          previous: null,
        },
      };

      const trackItems: SpotifyApi.TrackObjectSimplified[] = songs.map((s) => ({
        id: s.id,
        name: s.name,
        artists: [
          {
            id: s.artist_id,
            name: artistMap.get(s.artist_id) ?? "",
          },
        ],
        duration_ms: s.duration_ms ?? undefined,
      }));

      const tracksPayload: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified> =
        {
          items: trackItems,
          total: songs.length,
          limit: songs.length,
          offset: 0,
          next: null,
          previous: null,
        };

      return { album: albumPayload, tracks: tracksPayload };
    }

    // Stale cache: return cached data immediately and refresh in background so the page loads fast
    const { data: artistRowStale } = await supabase
      .from("artists")
      .select("id, name, image_url, genres")
      .eq("id", album.artist_id)
      .maybeSingle();
    const artistStale = artistRowStale as unknown as ArtistRow | null;
    const { data: songRowsStale } = await supabase
      .from("songs")
      .select("id, name, album_id, artist_id, duration_ms, track_number")
      .eq("album_id", id)
      .order("track_number", { ascending: true });
    const songsStale = (songRowsStale ?? []) as unknown as SongRow[];
    const artistIdsStale = [...new Set(songsStale.map((s) => s.artist_id))];
    const { data: artistRowsStale } = await supabase
      .from("artists")
      .select("id, name")
      .in("id", artistIdsStale.length ? artistIdsStale : [album.artist_id]);
    const artistMapStale = new Map(
      (artistRowsStale ?? []).map((r: { id: string; name: string }) => [r.id, r.name]),
    );
    const albumPayloadStale: SpotifyApi.AlbumObjectFull = {
      id: album.id,
      name: album.name,
      artists: [{ id: album.artist_id, name: artistStale?.name ?? artistMapStale.get(album.artist_id) ?? "" }],
      images: album.image_url ? [{ url: album.image_url }] : undefined,
      release_date: album.release_date ?? undefined,
      total_tracks: album.total_tracks ?? undefined,
      tracks: {
        items: songsStale.map((s) => ({
          id: s.id,
          name: s.name,
          artists: [{ id: s.artist_id, name: artistMapStale.get(s.artist_id) ?? "" }],
          duration_ms: s.duration_ms ?? undefined,
        })),
        total: songsStale.length,
        limit: songsStale.length,
        offset: 0,
        next: null,
        previous: null,
      },
    };
    const tracksPayloadStale: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified> = {
      items: songsStale.map((s) => ({
        id: s.id,
        name: s.name,
        artists: [{ id: s.artist_id, name: artistMapStale.get(s.artist_id) ?? "" }],
        duration_ms: s.duration_ms ?? undefined,
      })),
      total: songsStale.length,
      limit: songsStale.length,
      offset: 0,
      next: null,
      previous: null,
    };
    refreshAlbumFromSpotify(supabase, id).catch((e) =>
      console.warn(`${LOG_PREFIX} background album refresh failed for ${id}`, e),
    );
    return { album: albumPayloadStale, tracks: tracksPayloadStale };
  }

  logCacheMiss("album", id);

  const missStart = performance.now();
  try {
    const { album: albumResp, tracks: tracksResp } =
      await refreshAlbumFromSpotify(supabase, id);
    if (!albumResp || !tracksResp) throw new Error("Refresh returned no data");
    logPerf("cache_miss", "album", performance.now() - missStart, { id });
    return { album: albumResp, tracks: tracksResp };
  } catch (e) {
    console.error(`${LOG_PREFIX} getAlbum/getAlbumTracks failed`, e);
    throw new Error(`Failed to fetch album ${id} from Spotify`);
  }
}

export async function getOrFetchAlbum(id: string): Promise<{
  album: SpotifyApi.AlbumObjectFull;
  tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
}> {
  return timeAsync("cache", "getOrFetchAlbum", () => getOrFetchAlbumInner(id), { id });
}

/** Fetch album + tracks from Spotify and upsert (album once, each artist once, each song once). Returns the fetched data or null on error. */
async function refreshAlbumFromSpotify(
  supabase: SupabaseClient,
  id: string,
): Promise<{
  album: SpotifyApi.AlbumObjectFull | null;
  tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified> | null;
}> {
  try {
    const [albumResp, tracksResp] = await Promise.all([
      getAlbum(id),
      getAlbumTracks(id, 50, 0),
    ]);
    await upsertAlbumFromSpotify(supabase, albumResp);
    const albumArtistId = albumResp.artists?.[0]?.id;
    const artistIds = new Set<string>();
    for (const t of tracksResp.items ?? []) {
      const aid = t.artists?.[0]?.id;
      if (aid) artistIds.add(aid);
    }
    for (const aid of artistIds) {
      if (aid === albumArtistId) continue;
      const art = tracksResp.items?.find((tr) => tr.artists?.[0]?.id === aid)?.artists?.[0];
      if (art) await upsertArtistFromSpotify(supabase, art);
    }
    for (const t of tracksResp.items ?? []) {
      const firstId = t.artists?.[0]?.id ?? albumArtistId;
      if (firstId) await upsertSongRowOnly(supabase, t, albumResp.id, firstId);
    }
    return { album: albumResp, tracks: tracksResp };
  } catch (e) {
    console.error(`${LOG_PREFIX} album/track upsert error`, e);
    return { album: null, tracks: null };
  }
}

// --- getOrFetchTrack (DB-first cache + TTL)

async function getOrFetchTrackInner(
  id: string,
  opts?: { allowLastfmMapping?: boolean },
): Promise<SpotifyApi.TrackObjectFull> {
  const supabase = await createSupabaseServerClient();

  const { data: songRow, error } = await supabase
    .from("songs")
    .select("id, name, album_id, artist_id, duration_ms, track_number, cached_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} songs select failed`, error);
  }

  if (songRow) {
    const song = songRow as unknown as SongRow;
    const cacheTime = song.cached_at ?? song.updated_at;
    if (!isCacheStale(cacheTime)) {
      const [{ data: albumRow }, { data: artistRow }] = await Promise.all([
        supabase
          .from("albums")
          .select("id, name, artist_id, image_url, release_date")
          .eq("id", song.album_id)
          .maybeSingle(),
        supabase
          .from("artists")
          .select("id, name, image_url, genres")
          .eq("id", song.artist_id)
          .maybeSingle(),
      ]);

      const album = albumRow as unknown as AlbumRow | null;
      const artist = artistRow as unknown as ArtistRow | null;

      return {
        id: song.id,
        name: song.name,
        artists: [{ id: song.artist_id, name: artist?.name ?? "" }],
        duration_ms: song.duration_ms ?? undefined,
        album: album
          ? {
              id: album.id,
              name: album.name,
              artists: [
                {
                  id: album.artist_id,
                  name: artist?.name ?? "",
                },
              ],
              images: album.image_url ? [{ url: album.image_url }] : undefined,
              release_date: album.release_date ?? undefined,
            }
          : undefined,
      };
    }
  }

  logCacheMiss("song", id);

  const missStart = performance.now();
  try {
    const track = await getTrack(id, opts);
    const alb = track.album;
    if (!alb) throw new Error("Track has no album");

    try {
      await upsertTrackFromSpotify(
        supabase,
        track,
        alb.id,
        alb.name,
        alb.images?.[0]?.url ?? null,
        "release_date" in alb ? alb.release_date : undefined,
      );
    } catch (e) {
      console.error(`${LOG_PREFIX} upsertTrackFromSpotify error`, e);
    }

    logPerf("cache_miss", "song", performance.now() - missStart, { id });
    return track;
  } catch (e) {
    if (e instanceof SpotifyIntegrationDisabledError) {
      throw new Error(
        "Music catalog lookup is temporarily unavailable. Your listen was still saved.",
      );
    }
    console.error(`${LOG_PREFIX} getTrack failed`, e);
    throw new Error(`Failed to fetch track ${id} from Spotify`);
  }
}

export async function getOrFetchTrack(
  id: string,
  opts?: { allowLastfmMapping?: boolean },
): Promise<SpotifyApi.TrackObjectFull> {
  return timeAsync("cache", "getOrFetchTrack", () => getOrFetchTrackInner(id, opts), { id });
}

// --- Batch getOrFetch: DB-first, then single batch Spotify API (chunked), merge, preserve order

/** Build a Map from (ids, results) for backward-compatible Map-based call sites. */
export function batchResultsToMap<T>(
  ids: string[],
  results: (T | null)[],
): Map<string, T | null> {
  const map = new Map<string, T | null>();
  ids.forEach((id, i) => map.set(id, results[i] ?? null));
  return map;
}

function buildTrackFromRows(
  song: SongRow,
  album: AlbumRow | null,
  artistName: string,
): SpotifyApi.TrackObjectFull {
  return {
    id: song.id,
    name: song.name,
    artists: [{ id: song.artist_id, name: artistName }],
    duration_ms: song.duration_ms ?? undefined,
    album: album
      ? {
          id: album.id,
          name: album.name,
          artists: [{ id: album.artist_id, name: artistName }],
          images: album.image_url ? [{ url: album.image_url }] : undefined,
          release_date: album.release_date ?? undefined,
        }
      : undefined,
  };
}

/** Batch fetch tracks: DB first, then single getTracks() for missing (chunked 50). Returns array in input order. */
async function getOrFetchTracksBatchInner(
  ids: string[],
): Promise<(SpotifyApi.TrackObjectFull | null)[]> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (uniqueIds.length === 0) return ids.map(() => null);

  const memKey = getBatchCacheKey("tracks", ids);
  const cached = getFromBatchMemoryMap(memKey);
  if (cached) return ids.map((id) => (cached.get(id) as SpotifyApi.TrackObjectFull | null) ?? null);

  const supabase = await createSupabaseServerClient();
  const lookup = new Map<string, SpotifyApi.TrackObjectFull | null>();

  const { data: songRows } = await supabase
    .from("songs")
    .select("id, name, album_id, artist_id, duration_ms, cached_at, updated_at")
    .in("id", uniqueIds);
  const allSongs = (songRows ?? []) as unknown as SongRow[];
  const songs = allSongs.filter((s) => !isCacheStale(s.cached_at ?? s.updated_at));

  const albumIds = [...new Set(songs.map((s) => s.album_id).filter(Boolean))];
  const artistIds = [...new Set(songs.map((s) => s.artist_id).filter(Boolean))];

  const [{ data: albumRows }, { data: artistRows }] = await Promise.all([
    albumIds.length
      ? supabase
          .from("albums")
          .select("id, name, artist_id, image_url, release_date, cached_at, updated_at")
          .in("id", albumIds)
      : { data: [] },
    artistIds.length
      ? supabase
          .from("artists")
          .select("id, name")
          .in("id", artistIds)
      : { data: [] },
  ]);

  const albumMap = new Map((albumRows ?? []).map((a) => [a.id, a as unknown as AlbumRow]));
  const artistMap = new Map(
    (artistRows ?? []).map((r: { id: string; name: string }) => [r.id, r.name]),
  );

  for (const song of songs) {
    const album = albumMap.get(song.album_id) ?? null;
    const artistName = artistMap.get(song.artist_id) ?? "";
    lookup.set(song.id, buildTrackFromRows(song, album, artistName));
  }

  const missingIds = uniqueIds.filter((id) => !lookup.has(id));
  if (missingIds.length > 0) {
    try {
      const fetched = await getTracks(missingIds);
      for (const track of fetched) {
        const alb = track.album;
        if (!alb) continue;
        try {
          await upsertTrackFromSpotify(
            supabase,
            track,
            alb.id,
            alb.name,
            alb.images?.[0]?.url ?? null,
            "release_date" in alb ? alb.release_date : undefined,
          );
        } catch (e) {
          console.warn(`${LOG_PREFIX} upsertTrackFromSpotify (batch) failed for ${track.id}`, e);
        }
        lookup.set(track.id, track);
      }
      missingIds.forEach((id) => {
        if (!lookup.has(id)) lookup.set(id, null);
      });
    } catch (e) {
      console.error(`${LOG_PREFIX} getTracks batch failed`, e);
      missingIds.forEach((id) => lookup.set(id, null));
    }
  }

  setBatchMemoryMap(memKey, lookup as Map<string, unknown>);
  return ids.map((id) => lookup.get(id) ?? null);
}

export async function getOrFetchTracksBatch(
  ids: string[],
): Promise<(SpotifyApi.TrackObjectFull | null)[]> {
  return timeAsync("cache", "getOrFetchTracksBatch", () => getOrFetchTracksBatchInner(ids), { n: ids.length });
}

/** Batch fetch albums: DB first, then single getAlbums() for missing (chunked 20). Returns array in input order. */
async function getOrFetchAlbumsBatchInner(
  ids: string[],
): Promise<(SpotifyApi.AlbumObjectSimplified | null)[]> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (uniqueIds.length === 0) return ids.map(() => null);

  const memKey = getBatchCacheKey("albums", ids);
  const cached = getFromBatchMemoryMap(memKey);
  if (cached) return ids.map((id) => (cached.get(id) as SpotifyApi.AlbumObjectSimplified | null) ?? null);

  const supabase = await createSupabaseServerClient();
  const lookup = new Map<string, SpotifyApi.AlbumObjectSimplified | null>();

  const { data: albumRows } = await supabase
    .from("albums")
    .select("id, name, artist_id, image_url, release_date, total_tracks, cached_at, updated_at")
    .in("id", uniqueIds);
  const allAlbums = (albumRows ?? []) as unknown as AlbumRow[];
  const albums = allAlbums.filter((a) => !isCacheStale(a.cached_at ?? a.updated_at));

  const artistIds = [...new Set(albums.map((a) => a.artist_id).filter(Boolean))];
  const { data: artistRows } = await supabase
    .from("artists")
    .select("id, name")
    .in("id", artistIds);
  const artistMap = new Map(
    (artistRows ?? []).map((r: { id: string; name: string }) => [r.id, r.name]),
  );

  for (const album of albums) {
    const artistName = artistMap.get(album.artist_id) ?? "";
    lookup.set(album.id, {
      id: album.id,
      name: album.name,
      artists: [{ id: album.artist_id, name: artistName }],
      images: album.image_url ? [{ url: album.image_url }] : undefined,
    });
  }

  const missingIds = uniqueIds.filter((id) => !lookup.has(id));
  if (missingIds.length > 0) {
    try {
      const fetched = await getAlbums(missingIds);
      for (const album of fetched) {
        try {
          await upsertAlbumFromSpotify(supabase, album);
        } catch (e) {
          console.warn(`${LOG_PREFIX} upsertAlbumFromSpotify (batch) failed for ${album.id}`, e);
        }
        const first = album.artists?.[0];
        lookup.set(album.id, {
          id: album.id,
          name: album.name,
          artists: first ? [{ id: first.id, name: first.name }] : [],
          images: album.images,
        });
      }
      missingIds.forEach((id) => {
        if (!lookup.has(id)) lookup.set(id, null);
      });
    } catch (e) {
      console.error(`${LOG_PREFIX} getAlbums batch failed`, e);
      missingIds.forEach((id) => lookup.set(id, null));
    }
  }

  setBatchMemoryMap(memKey, lookup as Map<string, unknown>);
  return ids.map((id) => lookup.get(id) ?? null);
}

export async function getOrFetchAlbumsBatch(
  ids: string[],
): Promise<(SpotifyApi.AlbumObjectSimplified | null)[]> {
  return timeAsync("cache", "getOrFetchAlbumsBatch", () => getOrFetchAlbumsBatchInner(ids), { n: ids.length });
}

/** Batch fetch artists: DB first, then single getArtists() for missing (chunked 50). Returns array in input order. */
async function getOrFetchArtistsBatchInner(
  ids: string[],
): Promise<(SpotifyApi.ArtistObjectFull | null)[]> {
  const uniqueIds = [...new Set(ids)].filter(Boolean);
  if (uniqueIds.length === 0) return ids.map(() => null);

  const memKey = getBatchCacheKey("artists", ids);
  const cached = getFromBatchMemoryMap(memKey);
  if (cached) return ids.map((id) => (cached.get(id) as SpotifyApi.ArtistObjectFull | null) ?? null);

  const supabase = await createSupabaseServerClient();
  const lookup = new Map<string, SpotifyApi.ArtistObjectFull | null>();

  const { data: artistRows } = await supabase
    .from("artists")
    .select("id, name, image_url, genres, cached_at, updated_at")
    .in("id", uniqueIds);
  const allArtists = (artistRows ?? []) as unknown as ArtistRow[];
  const artistsWithImage = allArtists.filter(
    (a) => !isCacheStale(a.cached_at ?? a.updated_at) && a.image_url,
  );

  for (const a of artistsWithImage) {
    lookup.set(a.id, {
      id: a.id,
      name: a.name,
      images: [{ url: a.image_url! }],
      genres: a.genres ?? undefined,
      followers: { total: 0 },
    });
  }

  const missingIds = uniqueIds.filter((id) => !lookup.has(id));
  if (missingIds.length > 0) {
    try {
      const fetched = await getArtists(missingIds);
      for (const artist of fetched) {
        try {
          await upsertArtistFromSpotify(supabase, artist);
        } catch (e) {
          console.warn(`${LOG_PREFIX} upsertArtistFromSpotify (batch) failed for ${artist.id}`, e);
        }
        lookup.set(artist.id, artist);
      }
      missingIds.forEach((id) => {
        if (!lookup.has(id)) lookup.set(id, null);
      });
    } catch (e) {
      console.error(`${LOG_PREFIX} getArtists batch failed`, e);
      missingIds.forEach((id) => lookup.set(id, null));
    }
  }

  setBatchMemoryMap(memKey, lookup as Map<string, unknown>);
  return ids.map((id) => lookup.get(id) ?? null);
}

export async function getOrFetchArtistsBatch(
  ids: string[],
): Promise<(SpotifyApi.ArtistObjectFull | null)[]> {
  return timeAsync("cache", "getOrFetchArtistsBatch", () => getOrFetchArtistsBatchInner(ids), { n: ids.length });
}
