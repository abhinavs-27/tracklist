import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  getAlbum,
  getAlbumTracks,
  getArtist,
  getArtistAlbums,
  getArtistTopTracks,
  getTrack,
} from "@/lib/spotify";

const LOG_PREFIX = "[spotify-cache]";

function logCacheMiss(entity: string, id: string) {
  console.log(`${LOG_PREFIX} cache miss: ${entity} id=${id}`);
}

function logUpsert(entity: string, id: string) {
  console.log(`${LOG_PREFIX} upsert: ${entity} id=${id}`);
}

// --- DB row types (match 009_spotify_entities)

type ArtistRow = {
  id: string;
  name: string;
  image_url: string | null;
  genres: string[] | null;
  created_at: string;
  updated_at: string;
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
};

type SongRow = {
  id: string;
  name: string;
  album_id: string;
  artist_id: string;
  duration_ms: number | null;
  track_number: number | null;
  created_at: string;
  updated_at: string;
};

// --- Helpers: upsert from Spotify payloads

export async function upsertArtistFromSpotify(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  a: SpotifyApi.ArtistObjectFull | SpotifyApi.ArtistObjectSimplified,
) {
  const row = {
    id: a.id,
    name: a.name,
    image_url:
      "images" in a && a.images?.[0]?.url ? a.images[0].url : null,
    genres: "genres" in a && a.genres?.length ? a.genres : null,
    updated_at: new Date().toISOString(),
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
  supabase: ReturnType<typeof createSupabaseServerClient>,
  album: SpotifyApi.AlbumObjectFull | SpotifyApi.AlbumObjectSimplified,
) {
  const first = album.artists?.[0];
  if (!first) throw new Error("Album has no artist");

  // ensure primary artist exists
  await upsertArtistFromSpotify(supabase, first);

  const row = {
    id: album.id,
    name: album.name,
    artist_id: first.id,
    image_url: album.images?.[0]?.url ?? null,
    release_date: "release_date" in album ? album.release_date ?? null : null,
    total_tracks:
      "total_tracks" in album ? album.total_tracks ?? null : null,
    updated_at: new Date().toISOString(),
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
  supabase: ReturnType<typeof createSupabaseServerClient>,
  track: SpotifyApi.TrackObjectFull | SpotifyApi.TrackObjectSimplified,
  albumId: string,
  albumName: string,
  albumImageUrl: string | null,
  albumReleaseDate?: string,
) {
  const first = track.artists?.[0];
  if (!first) throw new Error("Track has no artist");

  await upsertArtistFromSpotify(supabase, first);

  const albumRow = {
    id: albumId,
    name: albumName,
    artist_id: first.id,
    image_url: albumImageUrl,
    release_date: albumReleaseDate ?? null,
    total_tracks: null,
    updated_at: new Date().toISOString(),
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

  const row = {
    id: track.id,
    name: track.name,
    album_id: albumId,
    artist_id: first.id,
    duration_ms: track.duration_ms ?? null,
    track_number: trackNumber,
    updated_at: new Date().toISOString(),
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

// --- getOrFetchArtist (lazy cache)

export async function getOrFetchArtist(
  id: string,
): Promise<SpotifyApi.ArtistObjectFull> {
  const supabase = createSupabaseServerClient();

  // 1) try cache first
  const { data: row, error } = await supabase
    .from("artists")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} artists select failed`, error);
  }

  if (row) {
    const a = row as unknown as ArtistRow;
    // If we have a cached artist but no image, try Spotify to backfill the image
    if (!a.image_url) {
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
    }
    const result: SpotifyApi.ArtistObjectFull = {
      id: a.id,
      name: a.name,
      images: a.image_url ? [{ url: a.image_url }] : undefined,
      genres: a.genres ?? undefined,
      followers: { total: 0 },
    };
    return result;
  }

  // 2) cache miss → Spotify
  logCacheMiss("artist", id);

  try {
    const artist = await getArtist(id);

    // upsert but don't fail the page if write fails
    try {
      await upsertArtistFromSpotify(supabase, artist);
    } catch (e) {
      console.error(`${LOG_PREFIX} upsertArtistFromSpotify error`, e);
    }

    return artist;
  } catch (e) {
    console.error(`${LOG_PREFIX} getArtist failed`, e);
    throw new Error(`Failed to fetch artist ${id} from Spotify`);
  }
}

// --- getOrFetchArtistAlbums: fetch from Spotify, upsert albums (and artists)

export async function getOrFetchArtistAlbums(
  artistId: string,
  limit = 20,
): Promise<SpotifyApi.PagingObject<SpotifyApi.AlbumObjectSimplified>> {
  const supabase = createSupabaseServerClient();

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
  const supabase = createSupabaseServerClient();

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

export async function getOrFetchAlbum(id: string): Promise<{
  album: SpotifyApi.AlbumObjectFull;
  tracks: SpotifyApi.PagingObject<SpotifyApi.TrackObjectSimplified>;
}> {
  const supabase = createSupabaseServerClient();

  const { data: albumRow, error: albumErr } = await supabase
    .from("albums")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (albumErr) {
    console.error(`${LOG_PREFIX} albums select failed`, albumErr);
  }

  if (albumRow) {
    const album = albumRow as unknown as AlbumRow;

    const { data: artistRow } = await supabase
      .from("artists")
      .select("*")
      .eq("id", album.artist_id)
      .maybeSingle();
    const artist = artistRow as unknown as ArtistRow | null;

    const { data: songRows, error: songsErr } = await supabase
      .from("songs")
      .select("*")
      .eq("album_id", id)
      .order("track_number", { ascending: true });

    if (songsErr) {
      console.error(`${LOG_PREFIX} songs select failed`, songsErr);
    }

    let songs = (songRows ?? []) as unknown as SongRow[];

    // If album is cached but tracklist is incomplete, backfill from Spotify so we show the full tracklist
    const totalTracks = album.total_tracks ?? 0;
    const needBackfill =
      songs.length === 0 ||
      (totalTracks > 0 && songs.length < totalTracks) ||
      (songs.length > 0 && totalTracks === 0); // total_tracks unknown → fetch full list
    if (needBackfill) {
      try {
        const [albumResp, tracksResp] = await Promise.all([
          getAlbum(id),
          getAlbumTracks(id, 50, 0),
        ]);
        await upsertAlbumFromSpotify(supabase, albumResp);
        const albumImage = albumResp.images?.[0]?.url ?? null;
        for (const t of tracksResp.items ?? []) {
          await upsertTrackFromSpotify(
            supabase,
            t,
            albumResp.id,
            albumResp.name,
            albumImage,
            albumResp.release_date,
          );
        }
        const { data: refetched } = await supabase
          .from("songs")
          .select("*")
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

  logCacheMiss("album", id);

  try {
    const [albumResp, tracksResp] = await Promise.all([
      getAlbum(id),
      getAlbumTracks(id, 50, 0),
    ]);

    try {
      await upsertAlbumFromSpotify(supabase, albumResp);
      const albumImage = albumResp.images?.[0]?.url ?? null;
      for (const t of tracksResp.items ?? []) {
        await upsertTrackFromSpotify(
          supabase,
          t,
          albumResp.id,
          albumResp.name,
          albumImage,
          albumResp.release_date,
        );
      }
    } catch (e) {
      console.error(`${LOG_PREFIX} album/track upsert error`, e);
    }

    return {
      album: albumResp,
      tracks: tracksResp,
    };
  } catch (e) {
    console.error(`${LOG_PREFIX} getAlbum/getAlbumTracks failed`, e);
    throw new Error(`Failed to fetch album ${id} from Spotify`);
  }
}

// --- getOrFetchTrack (lazy cache)

export async function getOrFetchTrack(
  id: string,
): Promise<SpotifyApi.TrackObjectFull> {
  const supabase = createSupabaseServerClient();

  const { data: songRow, error } = await supabase
    .from("songs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(`${LOG_PREFIX} songs select failed`, error);
  }

  if (songRow) {
    const song = songRow as unknown as SongRow;

    const [{ data: albumRow }, { data: artistRow }] = await Promise.all([
      supabase
        .from("albums")
        .select("*")
        .eq("id", song.album_id)
        .maybeSingle(),
      supabase
        .from("artists")
        .select("*")
        .eq("id", song.artist_id)
        .maybeSingle(),
    ]);

    const album = albumRow as unknown as AlbumRow | null;
    const artist = artistRow as unknown as ArtistRow | null;

    const trackPayload: SpotifyApi.TrackObjectFull = {
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

    return trackPayload;
  }

  logCacheMiss("song", id);

  try {
    const track = await getTrack(id);
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

    return track;
  } catch (e) {
    console.error(`${LOG_PREFIX} getTrack failed`, e);
    throw new Error(`Failed to fetch track ${id} from Spotify`);
  }
}
