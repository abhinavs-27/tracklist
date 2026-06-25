/**
 * One-time backfill: fill album release_date/total_tracks from Deezer,
 * prioritized by listener demand (album_stats.listen_count DESC).
 *
 * Usage:
 *   npm run backfill:album-dates
 *   DRY_RUN=1 npm run backfill:album-dates        # report matches, write nothing
 *   BACKFILL_TOP_N=2000 npm run backfill:album-dates
 *
 * Env:
 *   BACKFILL_TOP_N   How many undated albums to process (default 500).
 *   DRY_RUN          If "1", logs would-be matches without writing.
 */

// Node.js 20 lacks native WebSocket; polyfill with undici for Supabase Realtime.
import { WebSocket } from "undici";
if (!("WebSocket" in globalThis)) (globalThis as any).WebSocket = WebSocket;

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { matchAlbumOnDeezer } from "@/lib/deezer/match";
import { enrichAlbumDateFromDeezer } from "@/lib/deezer/enrich-album-date";

const TOP_N = parseInt(process.env.BACKFILL_TOP_N ?? "500", 10);
const DRY_RUN = process.env.DRY_RUN === "1";

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
  // album_stats has no FK to albums, so PostgREST can't embed albums from it.
  // Two-step: page album_stats by listens (single table), then fetch the undated
  // subset from albums (artists!inner uses the real albums.artist_id FK),
  // preserving the listen-desc order until we have `limit` undated albums.
  // albums<->artists has more than one FK (ambiguous embed), so resolve artist
  // names via a separate single-table lookup instead of a PostgREST embed.
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

async function main() {
  const supabase = createSupabaseAdminClient();
  console.log(`[backfill-album-dates] start TOP_N=${TOP_N} DRY_RUN=${DRY_RUN}`);

  const albums = await selectUndatedAlbumsByDemand(supabase, TOP_N);
  console.log(`[backfill-album-dates] ${albums.length} undated albums selected (by listens)`);

  let written = 0;
  let noMatch = 0;
  let skipped = 0;
  let errored = 0;

  for (const album of albums) {
    if (!album.artistName || !album.name) {
      skipped++;
      continue;
    }
    try {
      if (DRY_RUN) {
        const match = await withTimeout(
          matchAlbumOnDeezer(album.artistName, album.name),
          15000,
          `match ${album.artistName} – ${album.name}`,
        );
        if (match) {
          written++;
          console.log(`[dry] ${album.artistName} – ${album.name} -> ${match.releaseDate} (${match.totalTracks ?? "?"} tracks)`);
        } else {
          noMatch++;
        }
        continue;
      }
      const result = await withTimeout(
        enrichAlbumDateFromDeezer(supabase, album.id, album.artistName, album.name),
        15000,
        `enrich ${album.artistName} – ${album.name}`,
      );
      if (result === "written") written++;
      else if (result === "no-match") noMatch++;
      else if (result === "skipped-has-date") skipped++;
      else errored++;
    } catch (e) {
      errored++;
      console.warn(`[backfill-album-dates] error on ${album.id}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(
    `[backfill-album-dates] done. written=${written} no_match=${noMatch} skipped=${skipped} errored=${errored}`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error("[backfill-album-dates] fatal:", e);
  process.exit(1);
});
