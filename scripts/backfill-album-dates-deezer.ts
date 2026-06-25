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
  // album_stats ordered by listens, joined to album (name, artist) and artist name.
  const { data, error } = await supabase
    .from("album_stats")
    .select("album_id, listen_count, albums!inner ( id, name, release_date, artist_id, artists!inner ( name ) )")
    .is("albums.release_date", null)
    .order("listen_count", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`select album_stats: ${error.message}`);

  type Row = {
    album_id: string;
    albums: { id: string; name: string; release_date: string | null; artists: { name: string } };
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.albums.id,
    name: r.albums.name,
    artistName: r.albums.artists?.name ?? "",
  }));
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
