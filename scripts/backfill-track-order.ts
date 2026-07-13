/**
 * One-time backfill: fill tracks.track_number + disc_number from Deezer/MusicBrainz.
 *
 * Usage:
 *   npm run backfill:track-order
 *   DRY_RUN=1 npm run backfill:track-order
 *   BACKFILL_TOP_N=2000 BACKFILL_CONCURRENCY=6 npm run backfill:track-order
 *
 * Env:
 *   BACKFILL_TOP_N      How many albums to process (default 1000).
 *   BACKFILL_CONCURRENCY Workers (default 6; MusicBrainz portions still gated 1/s by their limiter).
 *   DRY_RUN             If "1", reports would-be results without writing.
 */

// Node.js 20 lacks native WebSocket; polyfill with undici for Supabase Realtime.
import { WebSocket } from "undici";
if (!("WebSocket" in globalThis)) Object.assign(globalThis, { WebSocket });

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { enrichTrackOrderForAlbum } from "@/lib/catalog/track-order/enrich";
import { resolveAlbumTracklist } from "@/lib/catalog/track-order/resolve";

const TOP_N = Math.max(1, parseInt(process.env.BACKFILL_TOP_N ?? "1000", 10));
const CONCURRENCY = Math.max(1, parseInt(process.env.BACKFILL_CONCURRENCY ?? "6", 10));
const DRY_RUN = process.env.DRY_RUN === "1";

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timed out after ${ms / 1000}s: ${label}`)), ms),
    ),
  ]);
}

type Counts = { written: number; noMatch: number; noSource: number; skipped: number; errored: number };

async function selectAlbumIds(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  limit: number,
): Promise<string[]> {
  const out: string[] = [];
  const PAGE = 300;

  // Pass 1: albums with a deezer external id (fast path), keyset by album_id.
  let lastId = "00000000-0000-0000-0000-000000000000";
  while (out.length < limit) {
    const { data, error } = await supabase
      .from("album_external_ids")
      .select("album_id, albums!inner ( id, track_order_checked_at )")
      .eq("source", "deezer")
      .is("albums.track_order_checked_at", null)
      .gt("album_id", lastId)
      .order("album_id", { ascending: true })
      .limit(PAGE);
    if (error) throw new Error(`select deezer albums: ${error.message}`);
    const rows = (data ?? []) as { album_id: string }[];
    if (rows.length === 0) break;
    for (const r of rows) {
      out.push(r.album_id);
      if (out.length >= limit) break;
    }
    lastId = rows[rows.length - 1].album_id;
    if (rows.length < PAGE) break;
  }

  // Pass 2: remaining unchecked albums (any), keyset by id.
  let lastAlbumId = "00000000-0000-0000-0000-000000000000";
  const seen = new Set(out);
  while (out.length < limit) {
    const { data, error } = await supabase
      .from("albums")
      .select("id")
      .is("track_order_checked_at", null)
      .gt("id", lastAlbumId)
      .order("id", { ascending: true })
      .limit(PAGE);
    if (error) throw new Error(`select albums: ${error.message}`);
    const rows = (data ?? []) as { id: string }[];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (!seen.has(r.id)) { out.push(r.id); seen.add(r.id); }
      if (out.length >= limit) break;
    }
    lastAlbumId = rows[rows.length - 1].id;
    if (rows.length < PAGE) break;
  }

  return out.slice(0, limit);
}

async function processAlbum(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  albumId: string,
  counts: Counts,
): Promise<void> {
  try {
    if (DRY_RUN) {
      const { data: a } = await supabase
        .from("albums").select("name, artist_id, mbid, track_order_checked_at").eq("id", albumId).maybeSingle();
      const album = a as { name: string; artist_id: string | null; mbid: string | null; track_order_checked_at: string | null } | null;
      if (!album || album.track_order_checked_at) { counts.skipped++; return; }
      let artistName = "";
      if (album.artist_id) {
        const { data: ar } = await supabase.from("artists").select("name").eq("id", album.artist_id).maybeSingle();
        artistName = (ar as { name?: string } | null)?.name ?? "";
      }
      const resolved = await withTimeout(
        resolveAlbumTracklist(supabase, { id: albumId, name: album.name, artistName, mbid: album.mbid }),
        20000, `resolve ${artistName} – ${album.name}`,
      );
      if (resolved) { counts.written++; console.log(`[dry] ${artistName} – ${album.name} -> ${resolved.source}, ${resolved.tracks.length} tracks`); }
      else { counts.noSource++; }
      return;
    }
    const result = await withTimeout(enrichTrackOrderForAlbum(supabase, albumId), 25000, `enrich ${albumId}`);
    if (result === "written") counts.written++;
    else if (result === "no-match") counts.noMatch++;
    else if (result === "no-source") counts.noSource++;
    else if (result === "skipped-checked") counts.skipped++;
    else counts.errored++;
  } catch (e) {
    counts.errored++;
    console.warn(`[backfill-track-order] error on ${albumId}:`, e instanceof Error ? e.message : e);
  }
}

async function main() {
  const supabase = createSupabaseAdminClient();
  console.log(`[backfill-track-order] start TOP_N=${TOP_N} CONCURRENCY=${CONCURRENCY} DRY_RUN=${DRY_RUN}`);
  const albumIds = await selectAlbumIds(supabase, TOP_N);
  console.log(`[backfill-track-order] ${albumIds.length} albums selected`);

  const counts: Counts = { written: 0, noMatch: 0, noSource: 0, skipped: 0, errored: 0 };
  let processed = 0;
  let next = 0;
  async function worker(): Promise<void> {
    while (next < albumIds.length) {
      const id = albumIds[next++];
      await processAlbum(supabase, id, counts);
      processed++;
      if (processed % 100 === 0) {
        console.log(`[backfill-track-order] progress: processed=${processed} written=${counts.written} no_match=${counts.noMatch} no_source=${counts.noSource} skipped=${counts.skipped} errored=${counts.errored}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, albumIds.length) }, () => worker()));

  console.log(`[backfill-track-order] done. written=${counts.written} no_match=${counts.noMatch} no_source=${counts.noSource} skipped=${counts.skipped} errored=${counts.errored}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[backfill-track-order] fatal:", e);
  process.exit(1);
});
