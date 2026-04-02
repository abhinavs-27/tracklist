import "server-only";

import { resolveAlbumArtistForAggregate } from "@/lib/analytics/resolve-log-catalog-ids";
import {
  UNKNOWN_ALBUM_ENTITY,
  UNKNOWN_ARTIST_ENTITY,
  UNKNOWN_TRACK_ENTITY,
} from "@/lib/analytics/build-listening-report";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

import type { ChartType } from "@/lib/charts/weekly-chart-types";

const LOG_PAGE = 5000;
const CATALOG_CHUNK = 400;

type LogRow = {
  track_id: string | null;
  album_id: string | null;
  artist_id: string | null;
  listened_at: string;
};

export type AggregatedPlay = {
  entity_id: string;
  play_count: number;
  last_played_at: string;
};

async function fetchLogsWindow(args: {
  userId: string;
  startIso: string;
  endExclusiveIso: string;
}): Promise<LogRow[]> {
  const admin = createSupabaseAdminClient();
  const out: LogRow[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await admin
      .from("logs")
      .select("track_id, album_id, artist_id, listened_at")
      .eq("user_id", args.userId)
      .gte("listened_at", args.startIso)
      .lt("listened_at", args.endExclusiveIso)
      .order("listened_at", { ascending: true })
      .range(from, from + LOG_PAGE - 1);

    if (error) {
      console.warn("[weekly-chart] fetch logs", error.message);
      break;
    }
    const batch = (data ?? []) as LogRow[];
    out.push(...batch);
    if (batch.length < LOG_PAGE) break;
    from += LOG_PAGE;
  }
  return out;
}

function normId(id: string | null | undefined): string | null {
  const t = id?.trim();
  return t || null;
}

type TrackRow = {
  id: string;
  artist_id: string | null;
  album_id: string | null;
};

/**
 * Loads tracks by id; on `.in()` failure (size limits, transient errors), splits the chunk recursively
 * so we don’t silently drop rows — that was bucketing real plays into “Unknown artist”.
 */
async function fetchTracksMap(
  ids: string[],
): Promise<Map<string, { artist_id: string | null; album_id: string | null }>> {
  const admin = createSupabaseAdminClient();
  const out = new Map<
    string,
    { artist_id: string | null; album_id: string | null }
  >();
  const unique = [...new Set(ids.map((id) => normId(id)).filter(Boolean))] as string[];

  async function loadChunk(chunk: string[]): Promise<void> {
    if (chunk.length === 0) return;
    const { data, error } = await admin
      .from("tracks")
      .select("id, artist_id, album_id")
      .in("id", chunk);
    if (!error) {
      for (const raw of data ?? []) {
        const r = raw as TrackRow;
        const id = normId(r.id);
        if (!id) continue;
        out.set(id, {
          artist_id: normId(r.artist_id),
          album_id: normId(r.album_id),
        });
      }
      return;
    }
    console.warn(
      "[weekly-chart] tracks batch",
      error.message,
      "size",
      chunk.length,
    );
    if (chunk.length <= 1) return;
    const mid = Math.floor(chunk.length / 2);
    await loadChunk(chunk.slice(0, mid));
    await loadChunk(chunk.slice(mid));
  }

  for (let i = 0; i < unique.length; i += CATALOG_CHUNK) {
    await loadChunk(unique.slice(i, i + CATALOG_CHUNK));
  }
  return out;
}

async function fetchAlbumsArtistMap(
  ids: string[],
): Promise<Map<string, { artist_id: string | null }>> {
  const admin = createSupabaseAdminClient();
  const out = new Map<string, { artist_id: string | null }>();
  const unique = [...new Set(ids.map((id) => normId(id)).filter(Boolean))] as string[];

  async function loadChunk(chunk: string[]): Promise<void> {
    if (chunk.length === 0) return;
    const { data, error } = await admin
      .from("albums")
      .select("id, artist_id")
      .in("id", chunk);
    if (!error) {
      for (const raw of data ?? []) {
        const r = raw as { id: string; artist_id: string | null };
        const id = normId(r.id);
        if (!id) continue;
        out.set(id, { artist_id: normId(r.artist_id) });
      }
      return;
    }
    console.warn(
      "[weekly-chart] albums batch",
      error.message,
      "size",
      chunk.length,
    );
    if (chunk.length <= 1) return;
    const mid = Math.floor(chunk.length / 2);
    await loadChunk(chunk.slice(0, mid));
    await loadChunk(chunk.slice(mid));
  }

  for (let i = 0; i < unique.length; i += CATALOG_CHUNK) {
    await loadChunk(unique.slice(i, i + CATALOG_CHUNK));
  }
  return out;
}

/** Second pass: any album id referenced on logs/tracks but still missing from the map (e.g. first batch failed). */
async function mergeMissingAlbums(
  albumById: Map<string, { artist_id: string | null }>,
  candidateIds: Iterable<string | null | undefined>,
): Promise<void> {
  const normalized = [
    ...new Set(
      [...candidateIds]
        .map(normId)
        .filter((id): id is string => id != null && id !== ""),
    ),
  ];
  const missing = normalized.filter((id) => !albumById.has(id));
  if (missing.length === 0) return;
  const extra = await fetchAlbumsArtistMap(missing);
  for (const [k, v] of extra) {
    if (!albumById.has(k)) albumById.set(k, v);
  }
}

function firstNonEmpty(
  ...vals: (string | null | undefined)[]
): string | null {
  for (const v of vals) {
    const t = v?.trim();
    if (t) return t;
  }
  return null;
}

/** When resolver missed (e.g. album row absent on first fetch), still attribute via track + album FKs. */
function weeklyArtistEntityId(
  resolvedArtist: string | null,
  log: LogRow,
  song:
    | { artist_id: string | null; album_id: string | null }
    | undefined,
  albumById: Map<string, { artist_id: string | null }>,
): string {
  const albumArtist = (albumId: string | null | undefined) => {
    const k = normId(albumId);
    if (!k) return null;
    return normId(albumById.get(k)?.artist_id ?? null);
  };
  return (
    firstNonEmpty(
      resolvedArtist,
      log.artist_id,
      song?.artist_id,
      albumArtist(log.album_id),
      song?.album_id ? albumArtist(song.album_id) : null,
    ) ?? UNKNOWN_ARTIST_ENTITY
  );
}

/**
 * Raw play counts from `logs` for the window; tie-break by latest listen (stable).
 * Catalog lookups are chunked so large weeks don’t miss rows. Album/artist keys use
 * resolved IDs with defensive fallbacks to `logs.album_id` / `logs.artist_id`.
 */
export async function aggregateWeeklyTop10(args: {
  userId: string;
  startIso: string;
  endExclusiveIso: string;
  chartType: ChartType;
}): Promise<AggregatedPlay[]> {
  const logs = await fetchLogsWindow({
    userId: args.userId,
    startIso: args.startIso,
    endExclusiveIso: args.endExclusiveIso,
  });

  if (!logs.length) return [];

  const trackIds = [...new Set(logs.map((l) => l.track_id).filter(Boolean) as string[])];
  const albumIdsFromLogs = [
    ...new Set(logs.map((l) => l.album_id).filter(Boolean) as string[]),
  ];

  const songById = await fetchTracksMap(trackIds);

  const extraAlbumIds = [
    ...new Set(
      [...songById.values()]
        .map((s) => s.album_id)
        .filter((id): id is string => Boolean(id?.trim())),
    ),
  ];
  const allAlbumIds = [...new Set([...albumIdsFromLogs, ...extraAlbumIds])];

  const albumById = await fetchAlbumsArtistMap(allAlbumIds);
  await mergeMissingAlbums(albumById, [
    ...logs.map((l) => l.album_id),
    ...[...songById.values()].map((s) => s.album_id),
  ]);

  const agg = new Map<string, { play_count: number; last_played_at: string }>();

  function bump(key: string, listenedAt: string) {
    const cur = agg.get(key);
    if (!cur) {
      agg.set(key, { play_count: 1, last_played_at: listenedAt });
      return;
    }
    cur.play_count += 1;
    if (listenedAt > cur.last_played_at) cur.last_played_at = listenedAt;
  }

  for (const log of logs) {
    const tid = normId(log.track_id);
    const s = tid ? songById.get(tid) : undefined;
    const { artistId: resolvedArtist, albumId: resolvedAlbum } =
      resolveAlbumArtistForAggregate({
        song: s,
        logAlbumId: log.album_id,
        logArtistId: log.artist_id,
        albumArtistId: (id) => {
          const k = normId(id);
          if (!k) return null;
          return normId(albumById.get(k)?.artist_id ?? null);
        },
      });

    if (args.chartType === "tracks") {
      const key = tid ?? UNKNOWN_TRACK_ENTITY;
      bump(key, log.listened_at);
      continue;
    }
    if (args.chartType === "albums") {
      const key =
        firstNonEmpty(resolvedAlbum, log.album_id, s?.album_id) ??
        UNKNOWN_ALBUM_ENTITY;
      bump(key, log.listened_at);
      continue;
    }
    const key = weeklyArtistEntityId(
      resolvedArtist,
      log,
      s,
      albumById,
    );
    bump(key, log.listened_at);
  }

  const rows: AggregatedPlay[] = [...agg.entries()].map(([entity_id, v]) => ({
    entity_id,
    play_count: v.play_count,
    last_played_at: v.last_played_at,
  }));

  rows.sort((a, b) => {
    if (b.play_count !== a.play_count) return b.play_count - a.play_count;
    return b.last_played_at.localeCompare(a.last_played_at);
  });

  return rows.slice(0, 10);
}
