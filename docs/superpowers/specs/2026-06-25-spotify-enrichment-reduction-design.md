# Spotify Enrichment Reduction Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Spotify API calls during post-import enrichment by using Last.fm tags for artist genres and Deezer for artist images before falling through to Spotify, eliminating Spotify calls entirely for tracks whose artist is already resolved.

**Architecture:** The existing BullMQ jobs (`resolve_artist_spotify`, `resolve_track_spotify`) are modified to try cheaper sources first — Last.fm → Deezer → Spotify — and early-return as soon as all required fields are populated. No changes to job names, queue plumbing, or `runSpotifyEnrichmentRetry`.

**Tech Stack:** Last.fm REST API (existing `LASTFM_API_KEY`), Deezer REST API (existing client in `lib/deezer/`), Supabase admin client, BullMQ

---

## Enrichment Cascade

### Artist enrichment (new order inside `resolveArtistSpotifyJob`)

1. Call Last.fm `artist.getInfo` → populate `genres` from filtered tags via existing `getLastfmArtistGenres()`
2. If `image_url` is still NULL → call new Deezer artist search → populate `image_url`
3. If genres + image are both populated → clear `needs_spotify_enrichment = false`, return — **no Spotify call**
4. Fall through to existing Spotify block only if image is still missing after step 2

### Track enrichment (new order inside `resolveTrackSpotifyJob`)

1. Check if `tracks.artist_id` is already set (post-import name resolution may have done this)
2. If `artist_id` is set:
   a. Look up album in catalog: `SELECT id FROM albums WHERE artist_id = $1 AND name_normalized = lower(trim($2))`
   b. If not found: call existing `enrichAlbumDateFromDeezer()` which searches Deezer and upserts the album row → set `album_id`
   c. Call new `getLastfmTrackDuration()` → populate `duration_ms`
   d. Clear `needs_spotify_enrichment = false`, return — **no Spotify call**
3. If `artist_id` is NULL → fall through to existing Spotify identity resolution unchanged

---

## Components

### New: `lib/deezer/client.ts` — add `searchDeezerArtists`

```ts
export async function searchDeezerArtists(
  artistName: string,
  limit = 5,
): Promise<DeezerArtistSearchItem[]>
```

Calls `GET https://api.deezer.com/search/artist?q={encoded}&limit={limit}`.

```ts
type DeezerArtistSearchItem = {
  id: number;
  name: string;
  picture_xl: string; // highest-res image URL
  nb_fan: number;
};
```

Uses the existing Bottleneck limiter already on the Deezer client (6 concurrent, 50ms min).

### New: `lib/deezer/enrich-artist-deezer.ts`

```ts
export async function enrichArtistImageFromDeezer(
  artistId: string,   // our UUID
  artistName: string,
): Promise<{ enriched: boolean }>
```

1. Calls `searchDeezerArtists(artistName)`
2. Picks best result: `result.name` normalized must match `artistName` normalized (case-insensitive, trimmed)
3. If match found and `picture_xl` is non-empty: updates `artists.image_url = picture_xl` where `id = artistId` and `image_url IS NULL`
4. Returns `{ enriched: true }` on success, `{ enriched: false }` on no match or empty image

### New: `lib/lastfm/enrich-track-lfm.ts`

```ts
export async function getLastfmTrackDuration(
  trackName: string,
  artistName: string,
): Promise<number | null>  // duration_ms or null
```

Calls Last.fm `track.getInfo&track={}&artist={}&api_key={}&format=json`. Returns `track.duration` (seconds from Last.fm) × 1000. Returns null on API error or missing field. Uses the same fetch pattern as `lib/lastfm/get-artist-genres.ts`.

### Modify: `lib/jobs/resolve-spotify-enrichment.ts`

**`resolveArtistSpotifyJob` changes:**

```ts
// Before the existing Spotify block, add:
const lfmGenres = await getLastfmArtistGenres(artistName);
if (lfmGenres.length > 0) {
  await admin.from("artists").update({ genres: lfmGenres }).eq("id", existingArtistId);
}

const needsImage = !existingArtist.image_url;
if (needsImage) {
  await enrichArtistImageFromDeezer(existingArtistId, artistName);
}

const refreshedArtist = await admin.from("artists").select("genres,image_url").eq("id", existingArtistId).single();
if ((refreshedArtist.data?.genres?.length ?? 0) > 0 && refreshedArtist.data?.image_url) {
  await admin.from("artists").update({ needs_spotify_enrichment: false }).eq("id", existingArtistId);
  return; // skip Spotify
}
// fall through to existing Spotify block
```

**`resolveTrackSpotifyJob` changes:**

```ts
// After existing Deezer album date call, before mapLastfmToSpotify:
if (existingTrack?.artist_id) {
  // Try catalog album lookup
  const { data: album } = await admin
    .from("albums")
    .select("id")
    .eq("artist_id", existingTrack.artist_id)
    .eq("name_normalized", albumName ? normalizeName(albumName) : "")
    .maybeSingle();

  if (album?.id) {
    await admin.from("tracks").update({ album_id: album.id }).eq("id", existingTrack.id);
  } else if (albumName) {
    await enrichAlbumDateFromDeezer(artistName, albumName, existingTrack.id);
  }

  const duration = await getLastfmTrackDuration(trackName, artistName);
  if (duration) {
    await admin.from("tracks").update({ duration_ms: duration }).eq("id", existingTrack.id);
  }

  await admin.from("tracks").update({ needs_spotify_enrichment: false }).eq("id", existingTrack.id);
  return; // skip Spotify
}
// fall through to existing mapLastfmToSpotify block
```

---

## What Does Not Change

- BullMQ job names (`resolve_artist_spotify`, `resolve_track_spotify`)
- `runSpotifyEnrichmentRetry` in `lib/cron/cron-runners.ts`
- `post-import-drain.ts`
- Existing Deezer album enrichment (`lib/deezer/enrich-album-date.ts`)
- Spotify calls for artists/tracks with no catalog match and no Last.fm/Deezer data

---

## Error Handling

- Last.fm and Deezer failures are non-fatal: log a warning and fall through to Spotify
- If Deezer returns a result but `picture_xl` is empty/placeholder, treat as no match
- `getLastfmTrackDuration` returning null does not block the early-return: duration is optional metadata
- All new network calls wrapped in try/catch; exceptions caught at job level

---

## Expected Impact

For a typical Last.fm bulk import (50k unique tracks, 5k unique artists):
- ~80% of artists already exist in catalog (popular artists enriched by other users) → genres from LFM tags, image already set → 0 Spotify calls
- ~20% genuinely new artists → LFM + Deezer attempt first → Spotify only for image misses
- Tracks with `artist_id` already set → 0 Spotify calls (majority after name resolution step)
- Tracks with `artist_id` NULL → Spotify still called (identity resolution required)
- **Overall estimated reduction: 70-80% fewer Spotify API calls**
