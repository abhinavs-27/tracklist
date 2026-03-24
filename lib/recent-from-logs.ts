import type { SupabaseClient } from "@supabase/supabase-js";

const LOGS_SCAN_LIMIT = 400;
const DEFAULT_MAX_ALBUMS = 12;

export type RecentAlbumItem = {
  album_id: string;
  album_name: string | null;
  artist_name: string;
  album_image: string | null;
  last_played_at: string;
};

export type RecentTrackRow = {
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name: string | null;
  album_image: string | null;
  played_at: string;
};

/** Unique recent albums from `logs` joined with `albums` / `artists` (all sources: manual, Last.fm, Spotify, etc.). */
export async function getRecentAlbumsFromLogs(
  supabase: SupabaseClient,
  userId: string,
  maxAlbums = DEFAULT_MAX_ALBUMS,
): Promise<RecentAlbumItem[]> {
  const { data: logRows, error } = await supabase
    .from("logs")
    .select("album_id, track_id, listened_at")
    .eq("user_id", userId)
    .order("listened_at", { ascending: false })
    .limit(LOGS_SCAN_LIMIT);

  if (error || !logRows?.length) return [];

  const trackIdsNeedingSong = [
    ...new Set(
      logRows
        .filter((r) => !r.album_id && r.track_id)
        .map((r) => r.track_id as string),
    ),
  ];
  const songAlbumMap = new Map<string, string>();
  if (trackIdsNeedingSong.length > 0) {
    const { data: songs } = await supabase
      .from("songs")
      .select("id, album_id")
      .in("id", trackIdsNeedingSong);
    if (songs) {
      for (const s of songs) {
        if (s.album_id) songAlbumMap.set(s.id, s.album_id);
      }
    }
  }

  const albumLatest = new Map<string, string>();
  for (const row of logRows) {
    const aid =
      (row.album_id as string | null) ??
      (row.track_id ? songAlbumMap.get(row.track_id as string) : null);
    if (!aid) continue;
    const at = row.listened_at as string;
    const prev = albumLatest.get(aid);
    if (!prev || new Date(at).getTime() > new Date(prev).getTime()) {
      albumLatest.set(aid, at);
    }
  }

  const sortedAlbumIds = [...albumLatest.entries()]
    .sort(
      (a, b) =>
        new Date(b[1]).getTime() - new Date(a[1]).getTime(),
    )
    .slice(0, maxAlbums * 2)
    .map(([id]) => id);

  if (sortedAlbumIds.length === 0) return [];

  const { data: albumRows } = await supabase
    .from("albums")
    .select("id, name, image_url, artist_id")
    .in("id", sortedAlbumIds);

  const artistIds = [
    ...new Set((albumRows ?? []).map((a) => a.artist_id as string)),
  ];
  let artistRows: { id: string; name: string }[] = [];
  if (artistIds.length > 0) {
    const { data } = await supabase
      .from("artists")
      .select("id, name")
      .in("id", artistIds);
    artistRows = (data ?? []) as { id: string; name: string }[];
  }

  const artistNameById = new Map(
    artistRows.map((r) => [r.id as string, r.name as string]),
  );

  const metaById = new Map<
    string,
    { name: string; artist_name: string; image: string | null }
  >();
  for (const a of albumRows ?? []) {
    const aid = a.id as string;
    const an = artistNameById.get(a.artist_id as string) ?? "";
    metaById.set(aid, {
      name: a.name as string,
      artist_name: an,
      image: (a.image_url as string | null) ?? null,
    });
  }

  const out: RecentAlbumItem[] = [];
  for (const id of sortedAlbumIds) {
    const meta = metaById.get(id);
    if (!meta) continue;
    const last = albumLatest.get(id);
    if (!last) continue;
    out.push({
      album_id: id,
      album_name: meta.name,
      artist_name: meta.artist_name,
      album_image: meta.image,
      last_played_at: last,
    });
  }

  return out;
}

/**
 * Recent track rows for profile / “recently played” UI — all from `logs` + catalog tables.
 */
export async function getRecentTracksFromLogs(
  supabase: SupabaseClient,
  userId: string,
  limit: number,
  offset: number,
): Promise<{ items: RecentTrackRow[]; hasMore: boolean }> {
  const fetchN = limit + 1;
  const { data: logRows, error } = await supabase
    .from("logs")
    .select("track_id, listened_at")
    .eq("user_id", userId)
    .order("listened_at", { ascending: false })
    .range(offset, offset + fetchN - 1);

  if (error) throw error;

  const rows = logRows ?? [];
  const hasMore = rows.length > limit;
  const slice = rows.slice(0, limit);
  if (slice.length === 0) return { items: [], hasMore: false };

  const trackIds = [...new Set(slice.map((r) => r.track_id as string).filter(Boolean))];
  const songMap = new Map<string, { name: string; album_id: string; artist_id: string }>();
  if (trackIds.length > 0) {
    const { data: songs } = await supabase
      .from("songs")
      .select("id, name, album_id, artist_id")
      .in("id", trackIds);
    for (const s of songs ?? []) {
      songMap.set(s.id as string, {
        name: s.name as string,
        album_id: s.album_id as string,
        artist_id: s.artist_id as string,
      });
    }
  }

  const albumIds = new Set<string>();
  const artistIds = new Set<string>();
  for (const r of slice) {
    const song = songMap.get(r.track_id as string);
    const aid = song?.album_id ?? null;
    const arid = song?.artist_id ?? null;
    if (aid) albumIds.add(aid);
    if (arid) artistIds.add(arid);
  }

  const albumMap = new Map<
    string,
    { name: string; image_url: string | null; artist_id: string }
  >();
  if (albumIds.size > 0) {
    const { data: albums } = await supabase
      .from("albums")
      .select("id, name, image_url, artist_id")
      .in("id", [...albumIds]);
    for (const a of albums ?? []) {
      albumMap.set(a.id as string, {
        name: a.name as string,
        image_url: (a.image_url as string | null) ?? null,
        artist_id: a.artist_id as string,
      });
      artistIds.add(a.artist_id as string);
    }
  }

  const artistMap = new Map<string, string>();
  if (artistIds.size > 0) {
    const { data: artists } = await supabase
      .from("artists")
      .select("id, name")
      .in("id", [...artistIds]);
    for (const ar of artists ?? []) {
      artistMap.set(ar.id as string, ar.name as string);
    }
  }

  const items: RecentTrackRow[] = [];
  for (const r of slice) {
    const song = songMap.get(r.track_id as string);
    const aid = song?.album_id ?? null;
    const album = aid ? albumMap.get(aid) : null;
    const arid = song?.artist_id ?? album?.artist_id ?? null;
    const artistName = arid ? (artistMap.get(arid) ?? "") : "";
    const trackName = song?.name ?? "Unknown track";
    const albumName = album?.name ?? null;
    const albumImage = album?.image_url ?? null;

    items.push({
      track_id: r.track_id as string,
      track_name: trackName,
      artist_name: artistName,
      album_name: albumName,
      album_image: albumImage,
      played_at: r.listened_at as string,
    });
  }

  return { items, hasMore };
}
