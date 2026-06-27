/**
 * One-off: rebuild leaderboard_cache from the current track_stats / album_stats tables.
 * Uses the admin client directly — no Next.js request context needed.
 *
 * Usage (from repo root):
 *   set -a && source .env && set +a && \
 *   NODE_OPTIONS='-r ./scripts/register-server-only-stub.cjs' npx tsx scripts/populate-leaderboard-cache.ts
 */

import { createSupabaseAdminClient } from "../lib/supabase-admin";

const SNAPSHOT_LIMIT = 500;

const LB_KEYS = [
  { type: "popular", entity: "album", rpc: "get_leaderboard_albums", metric: "popular" },
  { type: "topRated", entity: "song", rpc: "get_leaderboard_tracks", metric: "top_rated" },
  { type: "topRated", entity: "album", rpc: "get_leaderboard_albums", metric: "top_rated" },
] as const;

async function main() {
  const admin = createSupabaseAdminClient();
  let ok = 0;
  const errors: string[] = [];

  // popular:song — track_stats is stale/empty; count directly from logs via batched RPC
  {
    const id = "popular:song";
    try {
      const CHUNK = 500;
      // Collect all tracks with their metadata
      const allTracks: { id: string; name: string; album_id: string; artist_id: string }[] = [];
      let from = 0;
      for (;;) {
        const { data, error } = await admin
          .from("tracks")
          .select("id, name, album_id, artist_id")
          .range(from, from + CHUNK - 1);
        if (error) throw error;
        allTracks.push(...((data ?? []) as typeof allTracks));
        if ((data ?? []).length < CHUNK) break;
        from += CHUNK;
      }
      console.log(`  tracks loaded: ${allTracks.length}`);

      // Count plays per track via batched RPC
      const playCounts = new Map<string, number>();
      for (let i = 0; i < allTracks.length; i += CHUNK) {
        const batchIds = allTracks.slice(i, i + CHUNK).map((t) => t.id);
        const { data, error } = await admin.rpc("count_logs_by_track_ids", { p_track_ids: batchIds });
        if (error) throw error;
        for (const row of (data ?? []) as { track_id: string; play_count: number }[]) {
          playCounts.set(row.track_id, Number(row.play_count));
        }
        if (i % 5000 === 0) process.stdout.write(`  counted ${i}/${allTracks.length}\r`);
      }
      console.log(`\n  play counts fetched: ${playCounts.size} tracks with plays`);

      // Sort by play count and take top SNAPSHOT_LIMIT
      const sorted = allTracks
        .map((t) => ({ ...t, plays: playCounts.get(t.id) ?? 0 }))
        .filter((t) => t.plays > 0)
        .sort((a, b) => b.plays - a.plays)
        .slice(0, SNAPSHOT_LIMIT);

      // Fetch album art and artist names for top results only
      const topAlbumIds = [...new Set(sorted.map((t) => t.album_id))];
      const topArtistIds = [...new Set(sorted.map((t) => t.artist_id))];
      const albumRows: { id: string; image_url: string | null }[] = [];
      const artistRows: { id: string; name: string }[] = [];
      for (let i = 0; i < topAlbumIds.length; i += CHUNK) {
        const { data } = await admin.from("albums").select("id, image_url").in("id", topAlbumIds.slice(i, i + CHUNK));
        albumRows.push(...((data ?? []) as typeof albumRows));
      }
      for (let i = 0; i < topArtistIds.length; i += CHUNK) {
        const { data } = await admin.from("artists").select("id, name").in("id", topArtistIds.slice(i, i + CHUNK));
        artistRows.push(...((data ?? []) as typeof artistRows));
      }
      const albumMap = new Map(albumRows.map((a) => [a.id, a.image_url ?? null]));
      const artistMap = new Map(artistRows.map((a) => [a.id, a.name]));

      const entries = sorted.map((t) => ({
        entity_type: "song" as const,
        id: t.id,
        name: t.name,
        artist: artistMap.get(t.artist_id) ?? "Unknown",
        artwork_url: albumMap.get(t.album_id) ?? null,
        total_plays: t.plays,
        average_rating: null as number | null,
      }));

      const { error: upsertErr } = await admin.from("leaderboard_cache").upsert(
        { id, entries, total_count: entries.length, computed_at: new Date().toISOString() },
        { onConflict: "id" },
      );
      if (upsertErr) throw upsertErr;
      console.log(`[ok] ${id}: ${entries.length} entries`);
      ok++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : JSON.stringify(e);
      console.error(`[err] ${id}: ${msg}`);
      errors.push(`${id}: ${msg}`);
    }
  }

  for (const { type, entity, rpc, metric } of LB_KEYS) {
    const id = `${type}:${entity}`;
    try {
      const { data, error } = await admin.rpc(rpc as "get_leaderboard_tracks", {
        p_metric: metric,
        p_limit: SNAPSHOT_LIMIT,
        p_offset: 0,
      });
      if (error) throw error;

      const rows = (data ?? []) as Record<string, unknown>[];
      const totalCount = rows.length > 0 ? Number(rows[0].total_count ?? rows.length) : 0;

      const entries = rows.map((row) => {
        const listen = Number(row.listen_count ?? 0);
        const average_rating = row.avg_rating != null ? Number(row.avg_rating) : null;
        if (entity === "album") {
          return {
            entity_type: "album",
            id: String(row.album_id),
            name: String(row.album_name ?? ""),
            artist: String(row.artist_name ?? "Unknown"),
            artwork_url: (row.image_url as string | null) ?? null,
            total_plays: listen,
            average_rating,
          };
        }
        return {
          entity_type: "song",
          id: String(row.track_id),
          name: String(row.track_name ?? ""),
          artist: String(row.artist_name ?? "Unknown"),
          artwork_url: (row.image_url as string | null) ?? null,
          total_plays: listen,
          average_rating,
        };
      });

      const { error: upsertErr } = await admin.from("leaderboard_cache").upsert(
        { id, entries, total_count: totalCount, computed_at: new Date().toISOString() },
        { onConflict: "id" },
      );
      if (upsertErr) throw upsertErr;

      console.log(`[ok] ${id}: ${entries.length} entries, total=${totalCount}`);
      ok++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : JSON.stringify(e);
      console.error(`[err] ${id}: ${msg}`);
      errors.push(`${id}: ${msg}`);
    }
  }

  // mostFavorited only makes sense for albums — read entity_stats directly
  for (const entity of ["album"] as const) {
    const id = `mostFavorited:${entity}`;
    try {
      const { data, error } = await admin
        .from("entity_stats")
        .select("entity_id, favorite_count, play_count, avg_rating")
        .eq("entity_type", entity)
        .order("favorite_count", { ascending: false })
        .order("play_count", { ascending: false })
        .limit(SNAPSHOT_LIMIT);
      if (error) throw error;

      const entityIds = (data ?? []).map((r) => r.entity_id as string);
      if (entityIds.length === 0) {
        console.log(`[skip] ${id}: no entity_stats rows`);
        continue;
      }

      const { data: albumRows } = await admin
        .from("albums")
        .select("id, name, artist_id, image_url")
        .in("id", entityIds);
      const albumMap = new Map((albumRows ?? []).map((a) => [a.id, a]));

      const artistIds = [...new Set((albumRows ?? []).map((a) => a.artist_id))];
      const { data: artistRows } = await admin
        .from("artists")
        .select("id, name")
        .in("id", artistIds);
      const artistMap = new Map((artistRows ?? []).map((a) => [a.id, a.name]));

      const entries = (data ?? [])
        .map((row) => {
          const album = albumMap.get(row.entity_id as string);
          if (!album) return null;
          return {
            entity_type: "album" as const,
            id: row.entity_id as string,
            name: album.name,
            artist: artistMap.get(album.artist_id) ?? "Unknown",
            artwork_url: album.image_url ?? null,
            total_plays: Number(row.play_count ?? 0),
            average_rating: row.avg_rating != null ? Number(row.avg_rating) : null,
            favorite_count: row.favorite_count,
          };
        })
        .filter(Boolean);

      const { error: upsertErr } = await admin.from("leaderboard_cache").upsert(
        { id, entries, total_count: entries.length, computed_at: new Date().toISOString() },
        { onConflict: "id" },
      );
      if (upsertErr) throw upsertErr;

      console.log(`[ok] ${id}: ${entries.length} entries`);
      ok++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : JSON.stringify(e);
      console.error(`[err] ${id}: ${msg}`);
      errors.push(`${id}: ${msg}`);
    }
  }

  console.log(`\nDone: ${ok} cache rows written, ${errors.length} errors`);
  if (errors.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
