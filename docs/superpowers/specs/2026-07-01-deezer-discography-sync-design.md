# Deezer-First Artist Discography Sync

**Date:** 2026-07-01  
**Status:** Approved

## Problem

`SYNC_ARTIST_DISCOGRAPHY` calls Spotify's `/artists/{id}/albums` API. In Spotify Dev Mode the rate limit is low, causing the circuit breaker to trip and silently drop these jobs. Result: 19,762 of 19,763 artists have never had their discography synced, and artist pages show incomplete album lists.

Spotify search (`/api/search`) is good and stays. Only the background enrichment pipeline changes.

## What Changes

| File | Change |
|---|---|
| `lib/deezer/client.ts` | Add `getDeezerArtistAlbums(artistId)` |
| `lib/deezer/sync-discography.ts` | New — Deezer-first + MusicBrainz-fallback sync |
| `lib/jobs/run-job.ts` | `SYNC_ARTIST_DISCOGRAPHY` case points at new function |

No new job types, no new queues, no schema changes.

## Architecture

```
SYNC_ARTIST_DISCOGRAPHY job
        ↓
syncArtistDiscography(canonicalArtistId)   ← lib/deezer/sync-discography.ts
        ↓
  [7-day skip guard]
        ↓
  resolve Deezer artist ID
  (artist_external_ids source='deezer', or search by name → store)
        ↓
  getDeezerArtistAlbums(deezerId)
        ↓
  deezerId found, albums > 0?
    YES → diff + upsert albums + tracks → stamp discography_synced_at
    NO  → MusicBrainz fallback (see below) → stamp discography_synced_at
```

## Deezer Sync (Primary Path)

### 1. Resolve Deezer artist ID

- Check `artist_external_ids` for `source='deezer'` and this `artist_id` → use stored ID.
- If not stored: call `searchDeezerArtists(artistName)`, take the top result where normalized name matches closely (same normalization as `lib/deezer/match.ts`). Store in `artist_external_ids` as `source='deezer'`.
- If no match: fall through to MusicBrainz fallback.

### 2. Fetch albums

New function added to `lib/deezer/client.ts`:

```ts
getDeezerArtistAlbums(artistId: number): Promise<DeezerArtistAlbum[]>
// calls GET /artist/{id}/albums?limit=500
// fields: id, title, release_date, cover_xl, record_type, nb_tracks
```

`record_type` filter: include `album` and `ep`; exclude `single` and `live`. Singles would flood the album list with noise (same behaviour as Spotify's `include_groups=album,appears_on` filter).

Follows the same `deezerGet` + Bottleneck throttle pattern as the rest of the file.

### 3. Diff and upsert

For each Deezer album:

1. Check DB via a name+artist lookup (`SELECT id FROM albums WHERE artist_id = $1 AND lower(name) = lower($2)`). `findAlbumIdByArtistAndName` exists in `lib/spotify-cache.ts` but is not exported — the new file will either use a direct Supabase query or we export the function as part of this change.
2. **Found:** skip unless `image_url` is null — if so, write Deezer's `cover_xl`.
3. **Not found:** insert album row (`name`, `artist_id`, `image_url=cover_xl`, `release_date`, `total_tracks=nb_tracks`), then immediately call `getDeezerAlbumTracks(deezerAlbumId)` and insert track rows (`name`, `track_number`, `artist_id`, `album_id`).

Track insert reuses the same column set as the existing Spotify track upsert path.

### 4. Stamp

`UPDATE artists SET discography_synced_at = NOW()` on success (same as Spotify version).

Returns `{ deezerId, albumsFound, albumsInserted, tracksInserted }` for logging.

## MusicBrainz Fallback

Triggers when Deezer artist search returns no match **or** `albumsFound === 0`.

1. Read `artists.mbid`. If null: skip MusicBrainz, stamp `discography_synced_at`, return.
2. Call `GET /ws/2/release-group?artist={mbid}&type=album|ep&limit=100` (existing MusicBrainz HTTP pattern from `lib/musicbrainz/match-album-date.ts`).
3. For each release-group: diff via `findAlbumIdByArtistAndName` → insert missing albums (`name`, `artist_id`, `release_date` from `first-release-date`). No tracks — MusicBrainz track data requires one `/release` lookup per album at 1 req/sec, too slow for a background job. Tracks are filled later when someone visits the album page via the existing `SYNC_ALBUM_TRACKS` path.
4. Stamp `discography_synced_at`.

A name-based MusicBrainz search (for artists without MBID) is intentionally skipped — too slow and unreliable for a background job.

## Job Handler Change

```ts
// lib/jobs/run-job.ts
case "SYNC_ARTIST_DISCOGRAPHY": {
  const { syncArtistDiscography } = await import("@/lib/deezer/sync-discography");
  await syncArtistDiscography(job.artistId);
  break;
}
```

`syncArtistDiscographyForCanonicalArtist` in `lib/spotify-cache.ts` is kept but no longer called — retained as reference in case a Spotify final-fallback is added later.

## What Stays the Same

- Spotify search (`/api/search`) — untouched.
- `ENRICH_ARTIST` / `ENRICH_ALBUM` job types — still Spotify-backed.
- `scheduleArtistDiscographyBackfill` trigger in `lib/queries.ts` — unchanged.
- `SYNC_ALBUM_TRACKS` — still Spotify-backed (fills tracks on album page visit).
- Circuit breaker guard scoping fix (already shipped) — still in place.
- 7-day skip guard on `discography_synced_at` — unchanged.

## Error Handling

- Deezer HTTP errors: `deezerGet` already returns `null` on failure; treat as 0 albums → fall through to MusicBrainz.
- MusicBrainz HTTP errors: catch and log; stamp `discography_synced_at` anyway to avoid retry storms.
- Album insert errors: log per-album, continue with remaining albums (same as current Spotify behavior).
- Track insert errors: log per-track, continue — partial track lists are acceptable and better than no album at all.

## Out of Scope

- Replacing `ENRICH_ARTIST` / `ENRICH_ALBUM` with Deezer (separate concern, lower urgency).
- Spotify user OAuth / recently-played import (not yet built).
- Retroactive backfill of all 19,762 artists (separate one-off script; not part of this change).
