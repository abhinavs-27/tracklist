# Last.fm Import Speedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the Last.fm full-history import from ~1 hour per user to ~10 minutes by processing pages concurrently and eliminating sequential per-scrobble DB lookups.

**Architecture:** Three layered improvements: (1) batch name-based entity lookups before the per-scrobble loop so new artists/albums/tracks are found in 3 queries instead of up to 600; (2) concurrent-safe INSERT so two pages racing to create the same artist don't crash; (3) restructure the page loop to run 3 pages in parallel with staggered starts, staying under Last.fm's rate limit. A repair script runs `merge_catalog_duplicate_entities()` after an import to clean up any duplicates from race conditions.

**Tech Stack:** TypeScript, Supabase JS client, Node.js `Promise.allSettled`, `setTimeout` for staggering.

---

## File Map

| File | Change |
|------|--------|
| `lib/lastfm/ingest.ts` | Add batch name lookups + concurrent-safe inserts |
| `lib/lastfm/backfill-scrobbles-since.ts` | Replace sequential loop with concurrent batch loop |
| `scripts/repair-lastfm-import.ts` | New: runs catalog merge + resets stalled imports |
| `package.json` | Add `lastfm:repair` npm script |

---

## Task 1: Add `normalizedName` import and batch name lookups in `ingest.ts`

**Files:**
- Modify: `lib/lastfm/ingest.ts`

The current per-scrobble loop calls `findArtistIdByNormalizedName`, `findAlbumIdByArtistAndName`, `findTrackIdByArtistAlbumAndName` — each a separate sequential DB round-trip. This task replaces those with 3 batch queries run once before the loop.

- [ ] **Step 1: Add `normalizedName` to the entity-resolution import**

In `lib/lastfm/ingest.ts`, find the existing import block:
```ts
import {
  findAlbumIdByArtistAndName,
  findArtistIdByNormalizedName,
  findTrackIdByArtistAlbumAndName,
  getAlbumIdByExternalId,
  getArtistIdByExternalId,
  getTrackIdByExternalId,
  linkAlbumExternalId,
  linkArtistExternalId,
  linkTrackExternalId,
} from "@/lib/catalog/entity-resolution";
```

Replace with:
```ts
import {
  findAlbumIdByArtistAndName,
  findArtistIdByNormalizedName,
  findTrackIdByArtistAlbumAndName,
  getAlbumIdByExternalId,
  getArtistIdByExternalId,
  getTrackIdByExternalId,
  linkAlbumExternalId,
  linkArtistExternalId,
  linkTrackExternalId,
  normalizedName,
} from "@/lib/catalog/entity-resolution";
```

- [ ] **Step 2: Add the 3 batch lookup queries before the per-scrobble loop**

Find this comment in `ingest.ts` (it comes right after the `albumExtCache` Map is built):
```ts
  // Collect listens to batch-insert at the end
```

Insert the following block immediately before it:

```ts
  // ── Batch name lookups for uncached entities (3 queries, replaces N sequential calls) ──

  // 1. Artists not in external-id cache → look up by normalized name
  const uncachedArtistNorms = [...new Set(
    pending
      .filter((p) => !artistExtCache.has(p.artistId))
      .map((p) => normalizedName(p.scrobble.artistName))
      .filter((n): n is string => !!n),
  )];
  const artistNameMap = new Map<string, string>(); // name_normalized → uuid
  if (uncachedArtistNorms.length > 0) {
    const { data: anRows } = await supabase
      .from("artists")
      .select("id, name_normalized")
      .in("name_normalized", uncachedArtistNorms);
    for (const r of (anRows ?? []) as { id: string; name_normalized: string }[]) {
      artistNameMap.set(r.name_normalized, r.id);
    }
  }

  // 2. Albums not in external-id cache → look up by artist_id + normalized name
  const uncachedAlbumPending = pending.filter((p) => {
    const album = p.scrobble.albumName?.trim();
    return album && !albumExtCache.has(lfmAlbumId(p.scrobble.artistName, album));
  });
  const albumNameMap = new Map<string, string>(); // `${artistId}:${albumNorm}` → uuid
  if (uncachedAlbumPending.length > 0) {
    const albumArtistUuids = [...new Set(
      uncachedAlbumPending
        .map((p) => artistExtCache.get(p.artistId) ?? artistNameMap.get(normalizedName(p.scrobble.artistName)))
        .filter((u): u is string => !!u),
    )];
    const uncachedAlbumNorms = [...new Set(
      uncachedAlbumPending
        .map((p) => normalizedName(p.scrobble.albumName ?? ""))
        .filter((n): n is string => !!n),
    )];
    if (albumArtistUuids.length > 0 && uncachedAlbumNorms.length > 0) {
      const { data: albRows } = await supabase
        .from("albums")
        .select("id, name_normalized, artist_id")
        .in("artist_id", albumArtistUuids)
        .in("name_normalized", uncachedAlbumNorms);
      for (const r of (albRows ?? []) as { id: string; name_normalized: string; artist_id: string }[]) {
        albumNameMap.set(`${r.artist_id}:${r.name_normalized}`, r.id);
      }
    }
  }

  // 3. Tracks not in external-id cache → look up by artist_id + normalized name
  const uncachedTrackPending = pending.filter((p) => !trackExtCache.has(p.songId));
  const trackNameMap = new Map<string, string>(); // `${artistId}:${trackNorm}` → uuid
  if (uncachedTrackPending.length > 0) {
    const trackArtistUuids = [...new Set(
      uncachedTrackPending
        .map((p) => artistExtCache.get(p.artistId) ?? artistNameMap.get(normalizedName(p.scrobble.artistName)))
        .filter((u): u is string => !!u),
    )];
    const uncachedTrackNorms = [...new Set(
      uncachedTrackPending
        .map((p) => normalizedName(p.scrobble.trackName))
        .filter((n): n is string => !!n),
    )];
    if (trackArtistUuids.length > 0 && uncachedTrackNorms.length > 0) {
      const { data: trRows } = await supabase
        .from("tracks")
        .select("id, name_normalized, artist_id")
        .in("artist_id", trackArtistUuids)
        .in("name_normalized", uncachedTrackNorms);
      for (const r of (trRows ?? []) as { id: string; name_normalized: string; artist_id: string }[]) {
        trackNameMap.set(`${r.artist_id}:${r.name_normalized}`, r.id);
      }
    }
  }

```

- [ ] **Step 3: Replace per-scrobble sequential DB calls with map lookups**

Find the artist lookup line in the per-scrobble loop:
```ts
    const artistPreloaded = artistExtCache.has(artistId);
    let artistUuid =
      artistExtCache.get(artistId) ??
      (await findArtistIdByNormalizedName(supabase, artistName));
```

Replace with:
```ts
    const artistPreloaded = artistExtCache.has(artistId);
    let artistUuid =
      artistExtCache.get(artistId) ??
      artistNameMap.get(normalizedName(artistName));
```

Find the album lookup line:
```ts
      const albumPreloaded = albumExtCache.has(lfmAlbumKey);
      albumUuid =
        albumExtCache.get(lfmAlbumKey) ??
        (await findAlbumIdByArtistAndName(supabase, artistUuid, albumTitle));
```

Replace with:
```ts
      const albumPreloaded = albumExtCache.has(lfmAlbumKey);
      albumUuid =
        albumExtCache.get(lfmAlbumKey) ??
        albumNameMap.get(`${artistUuid}:${normalizedName(albumTitle)}`);
```

Find the track lookup line:
```ts
    const trackPreloaded = trackExtCache.has(songId);
    let trackUuid =
      trackExtCache.get(songId) ??
      (await findTrackIdByArtistAlbumAndName(
        supabase,
        artistUuid,
        albumUuid,
        trackName,
      ));
```

Replace with:
```ts
    const trackPreloaded = trackExtCache.has(songId);
    let trackUuid =
      trackExtCache.get(songId) ??
      trackNameMap.get(`${artistUuid}:${normalizedName(trackName)}`);
```

- [ ] **Step 4: Verify no type errors**

```bash
npx tsc --noEmit 2>&1 | grep "ingest.ts"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add lib/lastfm/ingest.ts
git commit -m "perf(lastfm): batch name lookups before per-scrobble loop — 3 queries vs N sequential"
```

---

## Task 2: Concurrent-safe entity inserts in `ingest.ts`

**Files:**
- Modify: `lib/lastfm/ingest.ts`

When two pages run concurrently and both encounter the same new artist, both will miss the cache and try to INSERT. The loser gets a unique constraint error and currently logs a warning + skips the scrobble. Fix: on INSERT failure, re-SELECT to get the row the winner created.

- [ ] **Step 1: Make artist INSERT concurrent-safe**

Find in `ingest.ts` the artist INSERT block (the one inside `if (!artistUuid)`):
```ts
      const { data: insArt, error: insArtErr } = await supabase
        .from("artists")
        .insert({
          name: artistName,
          lastfm_name: artistName,
          data_source: "lastfm",
          needs_spotify_enrichment: true,
          last_updated: now,
          updated_at: now,
        })
        .select("id")
        .single();
      if (insArtErr || !insArt) {
        console.warn("[lastfm ingest] artist insert failed", insArtErr);
        continue;
      }
      artistUuid = insArt.id as string;
```

Replace with:
```ts
      const { data: insArt } = await supabase
        .from("artists")
        .insert({
          name: artistName,
          lastfm_name: artistName,
          data_source: "lastfm",
          needs_spotify_enrichment: true,
          last_updated: now,
          updated_at: now,
        })
        .select("id")
        .maybeSingle();
      if (!insArt) {
        // Concurrent page may have inserted this artist simultaneously — re-query
        const { data: existing } = await supabase
          .from("artists").select("id").eq("name_normalized", normalizedName(artistName)).maybeSingle();
        if (!existing) { console.warn("[lastfm ingest] artist insert + re-query both failed"); continue; }
        artistUuid = (existing as { id: string }).id;
      } else {
        artistUuid = insArt.id as string;
      }
```

- [ ] **Step 2: Make album INSERT concurrent-safe**

Find the album INSERT block (inside `if (!albumUuid)`):
```ts
        const { data: insAlb, error: insAlbErr } = await supabase
          .from("albums")
          .insert({
            name: albumTitle,
            artist_id: artistUuid,
            image_url: coverFromScrobble ?? null,
            updated_at: now,
            cached_at: now,
          })
          .select("id")
          .single();
        if (insAlbErr || !insAlb) {
          console.warn("[lastfm ingest] album insert failed", insAlbErr);
        } else {
          albumUuid = insAlb.id as string;
        }
```

Replace with:
```ts
        const { data: insAlb } = await supabase
          .from("albums")
          .insert({
            name: albumTitle,
            artist_id: artistUuid,
            image_url: coverFromScrobble ?? null,
            updated_at: now,
            cached_at: now,
          })
          .select("id")
          .maybeSingle();
        if (!insAlb) {
          // Concurrent insert conflict — re-query
          const { data: existingAlb } = await supabase
            .from("albums").select("id").eq("artist_id", artistUuid).eq("name_normalized", normalizedName(albumTitle)).maybeSingle();
          if (existingAlb) albumUuid = (existingAlb as { id: string }).id;
        } else {
          albumUuid = insAlb.id as string;
        }
```

- [ ] **Step 3: Make track INSERT concurrent-safe**

Find the track INSERT block (inside `if (!trackUuid)`):
```ts
      const { data: insTr, error: insTrErr } = await supabase
        .from("tracks")
        .insert({
          name: trackName,
          lastfm_name: trackName,
          lastfm_artist_name: artistName,
          album_id: albumUuid,
          artist_id: artistUuid,
          data_source: "lastfm",
          needs_spotify_enrichment: true,
          updated_at: now,
        })
        .select("id")
        .single();
      if (insTrErr || !insTr) {
        console.warn("[lastfm ingest] track insert failed", insTrErr);
        continue;
      }
      trackUuid = insTr.id as string;
```

Replace with:
```ts
      const { data: insTr } = await supabase
        .from("tracks")
        .insert({
          name: trackName,
          lastfm_name: trackName,
          lastfm_artist_name: artistName,
          album_id: albumUuid,
          artist_id: artistUuid,
          data_source: "lastfm",
          needs_spotify_enrichment: true,
          updated_at: now,
        })
        .select("id")
        .maybeSingle();
      if (!insTr) {
        // Concurrent insert conflict — re-query
        const { data: existingTr } = await supabase
          .from("tracks").select("id").eq("artist_id", artistUuid).eq("name_normalized", normalizedName(trackName)).maybeSingle();
        if (!existingTr) { console.warn("[lastfm ingest] track insert + re-query both failed"); continue; }
        trackUuid = (existingTr as { id: string }).id;
      } else {
        trackUuid = insTr.id as string;
      }
```

- [ ] **Step 4: Verify no type errors**

```bash
npx tsc --noEmit 2>&1 | grep "ingest.ts"
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add lib/lastfm/ingest.ts
git commit -m "perf(lastfm): concurrent-safe entity inserts via re-query on conflict"
```

---

## Task 3: Concurrent page batches in `backfill-scrobbles-since.ts`

**Files:**
- Modify: `lib/lastfm/backfill-scrobbles-since.ts`

Replace the sequential `for` loop with: fetch page 1 to discover `totalPages`, then process remaining pages in batches of 3 with staggered starts (0ms, 67ms, 133ms within each batch at 200ms `pageDelayMs`).

- [ ] **Step 1: Replace the sequential loop**

Find and replace the entire block from `let p = 1;` through the closing `}` of the for loop (ends just before `const nowIso = ...`). The replacement is:

```ts
  // Ingest options shared across all page calls
  const ingestOpts = {
    enqueueSpotifyResolve: false,
    skipEntityStatsRefresh: true,
    skipEntityUpdates: true,
    skipDedup: true,
    entityCache,
  } as const;

  // ── Page 1: fetch first to discover totalPages ────────────────────────────
  const firstResult = await fetchLastfmRecentTracksPageSafe(
    username, opts.limit, 1, { fromUnix, pageDelayMs: 0 },
  );
  if (!firstResult.ok) {
    return { pagesFetched, imported, fetchFailed: true, fetchError: firstResult.error, fetchErrorCode: firstResult.errorCode, hasMore: false };
  }
  pagesFetched++;
  const { totalPages } = firstResult.pageInfo;

  if (firstResult.tracks.length > 0) {
    const ingest0 = await ingestLastfmScrobbles(supabase, userId, firstResult.tracks, ingestOpts);
    imported += ingest0.insertedLogs;
    console.log(LOG_PREFIX, "Last.fm page", { username, page: 1, totalPages, tracksThisPage: firstResult.tracks.length, insertedLogsThisBatch: ingest0.insertedLogs, importedTotal: imported });
  }
  if (opts.onProgress) {
    await opts.onProgress({ pagesDone: pagesFetched, pagesTotal: totalPages > 1 ? totalPages : null, logsAdded: imported }).catch(() => {});
  }
  if (totalPages <= 1) {
    hasMore = false;
  } else {

    // ── Pages 2..N: concurrent batches of CONCURRENCY ────────────────────────
    const CONCURRENCY = 3;
    const stagger = Math.max(0, Math.floor(opts.pageDelayMs / CONCURRENCY));
    const lastPage = Math.min(totalPages, safetyCap);

    for (let batchStart = 2; batchStart <= lastPage; batchStart += CONCURRENCY) {
      const batchNums: number[] = [];
      for (let i = 0; i < CONCURRENCY && batchStart + i <= lastPage; i++) {
        batchNums.push(batchStart + i);
      }

      const batchResults = await Promise.allSettled(
        batchNums.map((pageNum, i) =>
          new Promise<void>((res) => setTimeout(res, i * stagger))
            .then(() => fetchLastfmRecentTracksPageSafe(username, opts.limit, pageNum, { fromUnix, pageDelayMs: 0 }))
            .then(async (result) => {
              if (!result.ok) throw new Error(result.error ?? "fetch failed");
              if (result.tracks.length === 0) return 0;
              const ing = await ingestLastfmScrobbles(supabase, userId, result.tracks, ingestOpts);
              return ing.insertedLogs;
            }),
        ),
      );

      let batchInserted = 0;
      for (const r of batchResults) {
        pagesFetched++;
        if (r.status === "fulfilled") {
          batchInserted += r.value;
        } else {
          console.warn(LOG_PREFIX, "page failed (continuing)", { pages: batchNums, reason: String(r.reason) });
        }
      }
      imported += batchInserted;

      console.log(LOG_PREFIX, "Last.fm batch", { username, pages: batchNums, batchInserted, importedTotal: imported });
      if (opts.onProgress) {
        await opts.onProgress({ pagesDone: pagesFetched, pagesTotal: totalPages > 1 ? totalPages : null, logsAdded: imported }).catch(() => {});
      }
    }

    hasMore = totalPages > safetyCap;
  }
```

- [ ] **Step 2: Verify no type errors**

```bash
npx tsc --noEmit 2>&1 | grep "backfill-scrobbles"
```

Expected: no output.

- [ ] **Step 3: Quick smoke test — dry run with a known user**

```bash
DRY_RUN=1 npm run lastfm:run-local
```

Expected: lists pending users without processing. If no pending users, reset one first:
```sql
update users set lastfm_import_status = 'pending', lastfm_import_progress = '{}'
where id = '<user-id>';
```

- [ ] **Step 4: Commit**

```bash
git add lib/lastfm/backfill-scrobbles-since.ts
git commit -m "perf(lastfm): concurrent page batches (concurrency=3) — ~3x import speedup"
```

---

## Task 4: Repair script

**Files:**
- Create: `scripts/repair-lastfm-import.ts`
- Modify: `package.json`

Runs `merge_catalog_duplicate_entities()` to clean up any duplicate artist/album/track rows created by concurrent inserts. Safe to run at any time, idempotent.

- [ ] **Step 1: Create the repair script**

Create `scripts/repair-lastfm-import.ts`:

```ts
/**
 * Repair script for Last.fm imports.
 * 1. Merges any duplicate catalog entities (artists/albums/tracks) created by concurrent import pages.
 * 2. Optionally resets a stalled import back to 'pending' so it can be retried.
 *
 * Usage:
 *   npm run lastfm:repair
 *
 * Options:
 *   USER_ID=<uuid>   — also reset that user's import status to 'pending' for retry
 */

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const USER_ID = process.env.USER_ID?.trim() ?? null;
const LOG = "[lastfm-repair]";

async function main() {
  const supabase = createSupabaseAdminClient();
  const t0 = Date.now();

  console.log(LOG, "running merge_catalog_duplicate_entities — this may take a minute...");
  const { data: mergeResult, error: mergeErr } = await supabase.rpc(
    "merge_catalog_duplicate_entities",
  );
  if (mergeErr) {
    console.error(LOG, "merge failed", mergeErr);
  } else {
    console.log(LOG, "merge done", mergeResult);
  }

  if (USER_ID) {
    const { error: resetErr } = await supabase
      .from("users")
      .update({ lastfm_import_status: "pending", lastfm_import_progress: {} })
      .eq("id", USER_ID);
    if (resetErr) console.error(LOG, "status reset failed", resetErr);
    else console.log(LOG, `reset import status to 'pending' for user ${USER_ID}`);
  }

  console.log(LOG, `done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(LOG, "fatal", e);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script to `package.json`**

Find the `lastfm:run-local` line in `package.json`:
```json
    "lastfm:run-local": "NODE_OPTIONS='-r ./scripts/load-env-local.cjs -r ./scripts/register-server-only-stub.cjs' tsx scripts/run-lastfm-imports-local.ts",
```

Add the repair script on the next line:
```json
    "lastfm:repair": "NODE_OPTIONS='-r ./scripts/load-env-local.cjs -r ./scripts/register-server-only-stub.cjs' tsx scripts/repair-lastfm-import.ts",
```

- [ ] **Step 3: Verify it runs**

```bash
DRY_RUN=1 npm run lastfm:repair
```

Expected output:
```
[lastfm-repair] running merge_catalog_duplicate_entities — this may take a minute...
[lastfm-repair] merge done ...
[lastfm-repair] done in X.Xs
```

(The `DRY_RUN` env var is not used by this script — it always runs. Running it now is safe; merge is idempotent.)

- [ ] **Step 4: Commit**

```bash
git add scripts/repair-lastfm-import.ts package.json
git commit -m "feat(lastfm): add lastfm:repair script for post-import catalog dedup"
```

---

## Self-Review

**Spec coverage:**
- ✅ Concurrent page batches (CONCURRENCY=3, staggered) — Task 3
- ✅ Batch name lookups (3 queries vs N sequential) — Task 1
- ✅ Concurrent-safe inserts (try-INSERT, re-SELECT on conflict) — Task 2
- ✅ Repair script for duplicates — Task 4

**Placeholder scan:** None found.

**Type consistency:**
- `ingestOpts` defined in Task 3 uses `as const` — compatible with `IngestLastfmScrobblesOptions`
- `normalizedName` imported in Task 1, used in Tasks 1 and 2 — consistent
- `batchNums` typed `number[]`, `batchResults` from `Promise.allSettled` — TS infers correctly
- `albumNameMap` key: `${artistId}:${albumNorm}` — same pattern in lookup and build

**Ordering:** Tasks 1 and 2 must complete before Task 3, since Task 3 runs concurrent ingests that depend on the concurrent-safe inserts and batch lookups. Task 4 is independent.
