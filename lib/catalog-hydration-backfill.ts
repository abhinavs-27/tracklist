import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { mapLastfmToSpotify } from "@/lib/lastfm/map-to-spotify";
import { getOrFetchTracksBatch } from "@/lib/spotify-cache";
import { isValidSpotifyId } from "@/lib/validation";

const IN_CHUNK = 200;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Smoke test: Last.fm → Spotify search + scoring (no DB writes).
 * Uses a stable, well-known track so failures usually mean API keys / rate limits / outage.
 */
export async function checkLastfmSpotifyMappingHealth(): Promise<{
  ok: boolean;
  matchFound: boolean;
  error?: string;
}> {
  try {
    const m = await mapLastfmToSpotify(
      "Bohemian Rhapsody",
      "Queen",
      "A Night at the Opera",
    );
    return { ok: true, matchFound: m != null };
  } catch (e) {
    return {
      ok: false,
      matchFound: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export type HydrateMissingCatalogResult = {
  scannedLogRows: number;
  distinctTrackIds: number;
  missingSpotifyIds: number;
  badPlaceholderSongIds: number;
  attempted: number;
  hydrated: number;
  stillNull: number;
  errors: string[];
  /**
   * This repair path only calls Spotify `GET /tracks` (by id). Last.fm has no API to resolve
   * bare Spotify track ids → titles; the health check uses Spotify Search + scoring, not `getTracks`.
   */
  hydrationSource: "spotify_get_tracks";
  lastfmSpotifyMappingHealth: {
    ok: boolean;
    matchFound: boolean;
    error?: string;
  };
};

/**
 * Hydrate `songs` (and related catalog) for Spotify track IDs referenced by `logs` but missing
 * from `songs`, plus rows that look like failed placeholder hydration (Track + no artist).
 *
 * Uses `getOrFetchTracksBatch(..., { allowNetwork: true })` — intended for cron / one-off repair,
 * not request paths.
 */
export async function runHydrateMissingCatalogFromLogs(
  supabase: SupabaseClient,
  opts: {
    logScanLimit?: number;
    hydrateBatchSize?: number;
  } = {},
): Promise<HydrateMissingCatalogResult> {
  const logScanLimit = opts.logScanLimit ?? 4000;
  const hydrateBatchSize = Math.min(opts.hydrateBatchSize ?? 50, 50);

  const lastfmSpotifyMappingHealth = await checkLastfmSpotifyMappingHealth();

  const { data: logRows, error: logErr } = await supabase
    .from("logs")
    .select("track_id")
    .not("track_id", "like", "lfm:%")
    .order("listened_at", { ascending: false })
    .limit(logScanLimit);

  if (logErr) {
    return {
      scannedLogRows: 0,
      distinctTrackIds: 0,
      missingSpotifyIds: 0,
      badPlaceholderSongIds: 0,
      attempted: 0,
      hydrated: 0,
      stillNull: 0,
      errors: [logErr.message],
      hydrationSource: "spotify_get_tracks",
      lastfmSpotifyMappingHealth,
    };
  }

  const rows = logRows ?? [];
  const distinct = [
    ...new Set(
      rows
        .map((r) => r.track_id as string)
        .filter((id) => typeof id === "string" && isValidSpotifyId(id)),
    ),
  ];

  const existing = new Set<string>();
  for (const part of chunk(distinct, IN_CHUNK)) {
    const { data: songRows, error: songErr } = await supabase
      .from("tracks")
      .select("id")
      .in("id", part);
    if (songErr) {
      return {
        scannedLogRows: rows.length,
        distinctTrackIds: distinct.length,
        missingSpotifyIds: 0,
        badPlaceholderSongIds: 0,
        attempted: 0,
        hydrated: 0,
        stillNull: 0,
        errors: [songErr.message],
        hydrationSource: "spotify_get_tracks",
        lastfmSpotifyMappingHealth,
      };
    }
    for (const s of songRows ?? []) existing.add(s.id as string);
  }

  const missingFromLogs = distinct.filter((id) => !existing.has(id));

  const { data: badPlaceholders, error: badErr } = await supabase
    .from("tracks")
    .select("id")
    .not("id", "like", "lfm:%")
    .eq("name", "Track")
    .is("artist_id", null)
    .limit(hydrateBatchSize);

  if (badErr) {
    return {
      scannedLogRows: rows.length,
      distinctTrackIds: distinct.length,
      missingSpotifyIds: missingFromLogs.length,
      badPlaceholderSongIds: 0,
      attempted: 0,
      hydrated: 0,
      stillNull: 0,
      errors: [badErr.message],
      hydrationSource: "spotify_get_tracks",
      lastfmSpotifyMappingHealth,
    };
  }

  const badIds = (badPlaceholders ?? [])
    .map((r) => r.id as string)
    .filter((id) => isValidSpotifyId(id));

  const toHydrate = [
    ...new Set([...missingFromLogs, ...badIds]),
  ].slice(0, hydrateBatchSize);

  if (toHydrate.length === 0) {
    return {
      scannedLogRows: rows.length,
      distinctTrackIds: distinct.length,
      missingSpotifyIds: missingFromLogs.length,
      badPlaceholderSongIds: badIds.length,
      attempted: 0,
      hydrated: 0,
      stillNull: 0,
      errors: [],
      hydrationSource: "spotify_get_tracks",
      lastfmSpotifyMappingHealth,
    };
  }

  let hydrated = 0;
  let stillNull = 0;
  const errors: string[] = [];

  try {
    const fetched = await getOrFetchTracksBatch(toHydrate, {
      allowNetwork: true,
    });
    for (let i = 0; i < toHydrate.length; i++) {
      if (fetched[i] != null) hydrated += 1;
      else stillNull += 1;
    }
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  return {
    scannedLogRows: rows.length,
    distinctTrackIds: distinct.length,
    missingSpotifyIds: missingFromLogs.length,
    badPlaceholderSongIds: badIds.length,
    attempted: toHydrate.length,
    hydrated,
    stillNull,
    errors,
    hydrationSource: "spotify_get_tracks",
    lastfmSpotifyMappingHealth,
  };
}
