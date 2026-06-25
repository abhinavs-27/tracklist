/**
 * One-time backfill: fill album release_date/total_tracks from Deezer.
 *
 * Two selection modes (BACKFILL_MODE):
 *   demand (default) — prioritize by listener demand (album_stats.listen_count DESC).
 *                      Only reaches albums that have listens.
 *   all              — full coverage: scan ALL undated albums directly from the
 *                      `albums` table using KEYSET pagination by id, so albums
 *                      with zero listens (absent from album_stats) are covered too.
 *
 * Usage:
 *   npm run backfill:album-dates
 *   DRY_RUN=1 npm run backfill:album-dates                      # report matches, write nothing
 *   BACKFILL_TOP_N=2000 npm run backfill:album-dates
 *   BACKFILL_MODE=all BACKFILL_TOP_N=100000 npm run backfill:album-dates
 *   BACKFILL_SOURCE=musicbrainz BACKFILL_MODE=all BACKFILL_TOP_N=100000 npm run backfill:album-dates
 *
 * Env:
 *   BACKFILL_SOURCE  "deezer" (default) or "musicbrainz" (fallback for albums
 *                    Deezer can't match).
 *   BACKFILL_MODE    "demand" (default) or "all".
 *   BACKFILL_TOP_N   How many undated albums to process (default 500). In `all`
 *                    mode pass a large value for full coverage; it caps processing.
 *   DRY_RUN          If "1", logs would-be matches without writing.
 */

// Node.js 20 lacks native WebSocket; polyfill with undici for Supabase Realtime.
import { WebSocket } from "undici";
if (!("WebSocket" in globalThis)) (globalThis as any).WebSocket = WebSocket;

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { matchAlbumOnDeezer } from "@/lib/deezer/match";
import { enrichAlbumDateFromDeezer } from "@/lib/deezer/enrich-album-date";
import { matchAlbumDateOnMusicBrainz } from "@/lib/musicbrainz/match-album-date";
import { enrichAlbumDateFromMusicBrainz } from "@/lib/musicbrainz/enrich-album-date";

const TOP_N = parseInt(process.env.BACKFILL_TOP_N ?? "500", 10);
const DRY_RUN = process.env.DRY_RUN === "1";
const MODE = process.env.BACKFILL_MODE === "all" ? "all" : "demand";
const SOURCE = process.env.BACKFILL_SOURCE === "musicbrainz" ? "musicbrainz" : "deezer";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s: ${label}`)), ms),
    ),
  ]);
}

interface AlbumToFill {
  id: string;
  name: string;
  artistName: string;
}

async function selectUndatedAlbumsByDemand(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  limit: number,
): Promise<AlbumToFill[]> {
  // album_stats has no FK to albums (no embed possible) and albums<->artists has
  // more than one FK (ambiguous embed). So use three single-table queries: page
  // album_stats by listens, fetch the undated subset from albums, then resolve
  // artist names separately — preserving listen-desc order until `limit` undated.
  type AlbumRow = {
    id: string;
    name: string;
    artist_id: string | null;
    release_date: string | null;
  };

  const out: AlbumToFill[] = [];
  const PAGE = 200; // also bounds the .in() URL length
  for (let offset = 0; out.length < limit; offset += PAGE) {
    const { data: stats, error: statsError } = await supabase
      .from("album_stats")
      .select("album_id, listen_count")
      .order("listen_count", { ascending: false })
      .order("album_id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (statsError) throw new Error(`select album_stats: ${statsError.message}`);

    const statsRows = (stats ?? []) as { album_id: string; listen_count: number }[];
    if (statsRows.length === 0) break; // exhausted
    const ids = statsRows.map((r) => r.album_id);

    const { data: albs, error: albError } = await supabase
      .from("albums")
      .select("id, name, artist_id, release_date")
      .in("id", ids)
      .is("release_date", null);
    if (albError) throw new Error(`select albums: ${albError.message}`);

    const undatedById = new Map<string, AlbumRow>();
    for (const a of (albs ?? []) as AlbumRow[]) undatedById.set(a.id, a);

    const artistIds = [
      ...new Set(
        [...undatedById.values()]
          .map((a) => a.artist_id)
          .filter((x): x is string => Boolean(x)),
      ),
    ];
    const artistName = new Map<string, string>();
    if (artistIds.length) {
      const { data: artists, error: artistError } = await supabase
        .from("artists")
        .select("id, name")
        .in("id", artistIds);
      if (artistError) throw new Error(`select artists: ${artistError.message}`);
      for (const ar of (artists ?? []) as { id: string; name: string }[]) {
        artistName.set(ar.id, ar.name);
      }
    }

    for (const r of statsRows) {
      const a = undatedById.get(r.album_id);
      if (!a) continue;
      out.push({
        id: a.id,
        name: a.name,
        artistName: a.artist_id ? (artistName.get(a.artist_id) ?? "") : "",
      });
      if (out.length >= limit) break;
    }

    if (statsRows.length < PAGE) break; // last page reached
  }

  return out;
}

type Counts = { written: number; noMatch: number; skipped: number; errored: number };

function progressLog(processed: number, counts: Counts): void {
  console.log(
    `[backfill-album-dates] progress: processed=${processed} written=${counts.written} no_match=${counts.noMatch} skipped=${counts.skipped} errored=${counts.errored}`,
  );
}

async function processAlbum(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  album: AlbumToFill,
  counts: Counts,
): Promise<void> {
  if (!album.artistName || !album.name) {
    counts.skipped++;
    return;
  }
  try {
    if (DRY_RUN) {
      const matchPromise: Promise<{ releaseDate: string; totalTracks?: number | null } | null> =
        SOURCE === "musicbrainz"
          ? matchAlbumDateOnMusicBrainz(album.artistName, album.name)
          : matchAlbumOnDeezer(album.artistName, album.name);
      const match = await withTimeout(
        matchPromise,
        15000,
        `match ${album.artistName} – ${album.name}`,
      );
      if (match) {
        counts.written++;
        const tracks = "totalTracks" in match && match.totalTracks != null ? match.totalTracks : "?";
        console.log(`[dry] ${album.artistName} – ${album.name} -> ${match.releaseDate} (${tracks} tracks)`);
      } else {
        counts.noMatch++;
      }
      return;
    }
    const result = await withTimeout(
      SOURCE === "musicbrainz"
        ? enrichAlbumDateFromMusicBrainz(supabase, album.id, album.artistName, album.name)
        : enrichAlbumDateFromDeezer(supabase, album.id, album.artistName, album.name),
      15000,
      `enrich ${album.artistName} – ${album.name}`,
    );
    if (result === "written") counts.written++;
    else if (result === "no-match") counts.noMatch++;
    else if (result === "skipped-has-date") counts.skipped++;
    else counts.errored++;
  } catch (e) {
    counts.errored++;
    console.warn(`[backfill-album-dates] error on ${album.id}:`, e instanceof Error ? e.message : e);
  }
}

/**
 * Full-coverage scan over ALL undated albums via KEYSET pagination by id.
 *
 * As rows get release_date written they leave the `release_date IS NULL` filter,
 * but `id > lastId` keeps advancing, so no row is skipped (the offset/.range hazard)
 * and no-match rows (still null, id <= lastId) are never re-fetched.
 */
async function processAllUndated(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  cap: number,
  counts: Counts,
): Promise<number> {
  type AlbumRow = { id: string; name: string; artist_id: string | null };
  const PAGE = 200;
  // `id` is a uuid column, so the keyset lower bound must be a valid uuid. The
  // all-zeros uuid sorts before every real id.
  let lastId = "00000000-0000-0000-0000-000000000000";
  let processed = 0;

  while (processed < cap) {
    const { data: albs, error: albError } = await supabase
      .from("albums")
      .select("id, name, artist_id")
      .is("release_date", null)
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(PAGE);
    if (albError) throw new Error(`select albums: ${albError.message}`);

    const rows = (albs ?? []) as AlbumRow[];
    if (rows.length === 0) break; // exhausted

    // Resolve artist names separately (albums<->artists has multiple FKs, no embed).
    const artistIds = [
      ...new Set(rows.map((a) => a.artist_id).filter((x): x is string => Boolean(x))),
    ];
    const artistName = new Map<string, string>();
    if (artistIds.length) {
      const { data: artists, error: artistError } = await supabase
        .from("artists")
        .select("id, name")
        .in("id", artistIds);
      if (artistError) throw new Error(`select artists: ${artistError.message}`);
      for (const ar of (artists ?? []) as { id: string; name: string }[]) {
        artistName.set(ar.id, ar.name);
      }
    }

    for (const a of rows) {
      if (processed >= cap) break;
      const album: AlbumToFill = {
        id: a.id,
        name: a.name,
        artistName: a.artist_id ? (artistName.get(a.artist_id) ?? "") : "",
      };
      await processAlbum(supabase, album, counts);
      processed++;
      if (processed % 100 === 0) progressLog(processed, counts);
    }

    lastId = rows[rows.length - 1].id; // keyset advance
  }

  return processed;
}

async function main() {
  const supabase = createSupabaseAdminClient();
  console.log(`[backfill-album-dates] start SOURCE=${SOURCE} MODE=${MODE} TOP_N=${TOP_N} DRY_RUN=${DRY_RUN}`);

  const counts: Counts = { written: 0, noMatch: 0, skipped: 0, errored: 0 };

  if (MODE === "all") {
    const processed = await processAllUndated(supabase, TOP_N, counts);
    console.log(`[backfill-album-dates] processed ${processed} undated albums (all-mode keyset scan)`);
  } else {
    const albums = await selectUndatedAlbumsByDemand(supabase, TOP_N);
    console.log(`[backfill-album-dates] ${albums.length} undated albums selected (by listens)`);

    let processed = 0;
    for (const album of albums) {
      await processAlbum(supabase, album, counts);
      processed++;
      if (processed % 100 === 0) progressLog(processed, counts);
    }
  }

  console.log(
    `[backfill-album-dates] done. written=${counts.written} no_match=${counts.noMatch} skipped=${counts.skipped} errored=${counts.errored}`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("[backfill-album-dates] fatal:", e);
  process.exit(1);
});
