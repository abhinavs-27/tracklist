import "server-only";

import { resolveAlbumArtistForAggregate } from "@/lib/analytics/resolve-log-catalog-ids";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { ReportEntityType } from "@/lib/analytics/getListeningReports";

/**
 * Aggregates from `logs` + catalog joins for a bounded custom window (no precomputed row).
 */
export async function customRangeAggregate(args: {
  userId: string;
  entityType: ReportEntityType;
  startInclusive: Date;
  endExclusive: Date;
}): Promise<{ entity_id: string; count: number }[]> {
  const admin = createSupabaseAdminClient();
  const start = args.startInclusive.toISOString();
  const end = args.endExclusive.toISOString();

  const { data: logs, error } = await admin
    .from("logs")
    .select("id, track_id, album_id, artist_id, listened_at")
    .eq("user_id", args.userId)
    .gte("listened_at", start)
    .lt("listened_at", end)
    .limit(20000);

  if (error || !logs?.length) return [];

  const trackIds = [
    ...new Set(
      logs.map((l) => l.track_id).filter(Boolean) as string[],
    ),
  ];
  const albumIds = [
    ...new Set(
      logs.map((l) => l.album_id).filter(Boolean) as string[],
    ),
  ];

  const { data: songs } = trackIds.length
    ? await admin.from("tracks").select("id, artist_id, album_id").in("id", trackIds)
    : { data: [] };

  const songById = new Map(
    (songs ?? []).map((s) => [
      s.id,
      s as { artist_id: string | null; album_id: string | null },
    ]),
  );

  const extraAlbumIds = [
    ...new Set(
      [...songById.values()]
        .map((s) => s.album_id)
        .filter((id): id is string => Boolean(id?.trim())),
    ),
  ];
  const allAlbumIds = [...new Set([...albumIds, ...extraAlbumIds])];

  const { data: albums } = allAlbumIds.length
    ? await admin.from("albums").select("id, artist_id").in("id", allAlbumIds)
    : { data: [] };

  const albumById = new Map(
    (albums ?? []).map((a) => [a.id, a as { artist_id: string }]),
  );

  const artistIds = new Set<string>();
  for (const l of logs) {
    if (l.track_id) {
      const s = songById.get(l.track_id);
      const sa = s?.artist_id?.trim();
      if (sa) artistIds.add(sa);
    }
    if (l.album_id?.trim()) {
      const a = albumById.get(l.album_id);
      if (a?.artist_id) artistIds.add(a.artist_id);
    }
    const la = l.artist_id?.trim();
    if (la) artistIds.add(la);
  }

  const { data: artists } = artistIds.size
    ? await admin
        .from("artists")
        .select("id, genres")
        .in("id", [...artistIds])
    : { data: [] };

  const artistById = new Map(
    (artists ?? []).map((a) => [
      a.id,
      a as { id: string; genres: string[] | null },
    ]),
  );

  const counts = new Map<string, number>();

  function add(key: string, n = 1) {
    counts.set(key, (counts.get(key) ?? 0) + n);
  }

  for (const log of logs) {
    if (args.entityType === "track" && log.track_id) {
      add(log.track_id);
      continue;
    }
    const s = log.track_id ? songById.get(log.track_id) : undefined;
    const { artistId, albumId } = resolveAlbumArtistForAggregate({
      song: s,
      logAlbumId: log.album_id,
      logArtistId: log.artist_id,
      albumArtistId: (id) => albumById.get(id)?.artist_id,
    });

    if (args.entityType === "album" && albumId) {
      add(albumId);
    }
    if (args.entityType === "artist" && artistId) {
      add(artistId);
    }
    if (args.entityType === "genre" && artistId) {
      const g = artistById.get(artistId)?.genres;
      if (g?.length) {
        for (const raw of g.slice(0, 3)) {
          const genre = raw?.trim().toLowerCase();
          if (genre) add(genre);
        }
      }
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([entity_id, count]) => ({ entity_id, count }));
}
