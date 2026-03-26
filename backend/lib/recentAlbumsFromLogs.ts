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

/** Same logic as Next.js `lib/recent-from-logs.ts` — keep in sync manually. */
export async function getRecentAlbumsFromLogs(
  supabase: SupabaseClient,
  userId: string,
  maxAlbums = DEFAULT_MAX_ALBUMS,
): Promise<RecentAlbumItem[]> {
  const { data: logRows, error } = await supabase
    .from("logs")
    .select("album_id, track_id, listened_at")
    .eq("user_id", userId)
    .not("listened_at", "is", null)
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
    for (const s of songs ?? []) {
      if (s.album_id) songAlbumMap.set(s.id, s.album_id);
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
    if (out.length >= maxAlbums) break;
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
