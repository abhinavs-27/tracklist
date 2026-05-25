# Genius Credits Integration Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Genius as the primary credits source for songs, with MusicBrainz as fallback when Genius finds nothing.

**Architecture:** A new `packages/genius-client/` workspace package handles the Genius HTTP API. A new `lib/genius/enrich-song-genius.ts` function does the search-match-extract-insert flow. `lib/musicbrainz/enrich-song.ts` is modified to try Genius first, then fall through to the existing MB logic if Genius finds no credits.

**Tech Stack:** Genius REST API (client access token auth), Bottleneck rate limiting, existing Supabase admin client + upsertCreditArtist pattern.

---

## Genius API

Base URL: `https://api.genius.com`  
Auth: `Authorization: Bearer {GENIUS_ACCESS_TOKEN}` header  
Rate limit: 5 req/sec (conservative — Genius doesn't publish a hard limit for client tokens)

**Two endpoints used:**

`GET /search?q=<query>` — search for a song  
Response shape:
```json
{
  "response": {
    "hits": [
      {
        "type": "song",
        "result": {
          "id": 3039923,
          "title": "HUMBLE.",
          "primary_artist": { "id": 1, "name": "Kendrick Lamar" }
        }
      }
    ]
  }
}
```

`GET /songs/:id` — fetch full song with credits  
Response shape:
```json
{
  "response": {
    "song": {
      "id": 3039923,
      "title": "HUMBLE.",
      "primary_artist": { "id": 1, "name": "Kendrick Lamar" },
      "producer_artists": [{ "id": 12, "name": "Mike WiLL Made-It" }],
      "writer_artists": [{ "id": 1, "name": "Kendrick Lamar" }],
      "featured_artists": []
    }
  }
}
```

---

## Files

| Action | Path |
|--------|------|
| Create | `packages/genius-client/package.json` |
| Create | `packages/genius-client/tsconfig.json` |
| Create | `packages/genius-client/src/index.ts` |
| Create | `lib/genius/enrich-song-genius.ts` |
| Modify | `lib/musicbrainz/upsert-credit-artist.ts` |
| Modify | `lib/musicbrainz/enrich-song.ts` |
| Modify | `package.json` (add workspace + dependency) |

---

## packages/genius-client

Mirrors the structure of `packages/musicbrainz-client`.

**`package.json`:**
```json
{
  "name": "@tracklist/genius-client",
  "version": "0.0.1",
  "main": "src/index.ts",
  "dependencies": {
    "bottleneck": "*"
  }
}
```

**`tsconfig.json`:** extend root tsconfig, same as musicbrainz-client.

**`src/index.ts`** exports:

```typescript
export interface GeniusArtist {
  id: number;
  name: string;
}

export interface GeniusSong {
  id: number;
  title: string;
  primary_artist: GeniusArtist;
  producer_artists: GeniusArtist[];
  writer_artists: GeniusArtist[];
  featured_artists: GeniusArtist[];
}

export interface GeniusSearchHit {
  type: string;
  result: {
    id: number;
    title: string;
    primary_artist: GeniusArtist;
  };
}

// Returns top song hits for the query
export async function searchGenius(q: string): Promise<GeniusSearchHit[]>

// Returns full song with producer/writer/featured arrays, or null if not found
export async function fetchGeniusSong(id: number): Promise<GeniusSong | null>
```

Rate limiter: Bottleneck `{ minTime: 200, maxConcurrent: 1 }` (5 req/sec).

Auth token read from `process.env.GENIUS_ACCESS_TOKEN`. If the env var is absent, both functions return empty/null immediately (graceful degradation — no crash).

---

## Match Verification

Genius search can return wrong results. Match verification is mandatory before extracting credits. Wrong credits are worse than no credits.

```typescript
function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*\(feat\..*?\)/gi, "")
    .replace(/\s*\[feat\..*?\]/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTitleMatch(trackTitle: string, geniusTitle: string): boolean {
  const a = normalizeTitle(trackTitle);
  const b = normalizeTitle(geniusTitle);
  return a === b || a.includes(b) || b.includes(a);
}

function isArtistMatch(trackArtist: string, geniusArtist: string): boolean {
  const a = trackArtist.toLowerCase().trim();
  const b = geniusArtist.toLowerCase().trim();
  return a.includes(b) || b.includes(a);
}
```

Both checks must pass. If the top search result fails either, the Genius step returns false (no credits) and MB fallback runs.

---

## lib/genius/enrich-song-genius.ts

```typescript
export async function enrichSongGenius(
  supabase: SupabaseClient,
  songUuid: string,
): Promise<boolean>  // returns true if any credits were inserted
```

**Flow:**
1. Fetch track `name` from `tracks` table and primary artist name via join (see DB query below)
2. Call `searchGenius("{name} {artistName}")`, take hits where `type === "song"`
3. Find first hit passing both `isTitleMatch` and `isArtistMatch`
4. If no match found → return `false`
5. Call `fetchGeniusSong(hit.result.id)`
6. If null response → return `false`
7. For each `producer_artists` entry: upsert artist, insert into `song_producers`
8. For each `writer_artists` entry: upsert artist, insert into `song_songwriters`
9. For each `featured_artists` entry: upsert artist, insert into `track_featuring_artists`
10. Return `true` if any inserts succeeded (i.e., at least one of the three arrays was non-empty and inserted without error)

**Getting artist name from DB:**

```sql
SELECT t.name, a.name as artist_name, t.lastfm_artist_name
FROM tracks t
LEFT JOIN artists a ON a.id = t.artist_id
WHERE t.id = $songUuid
```

Use `artist_name ?? lastfm_artist_name` as the artist name in the search query. If both are null (rare edge case), search with track name only.

**Artist upsert for Genius:** calls the modified `upsertCreditArtist` with `{ id: null, name: geniusArtist.name }`. The MBID-optional path does name lookup then insert with `data_source: "genius"`.

---

## upsert-credit-artist.ts changes

Change the input type from `MbArtist` (which requires `id`) to:
```typescript
interface CreditArtist {
  id: string | null;  // MBID if known, null for Genius-sourced artists
  name: string;
}
```

When `id` is null, skip the MBID lookup entirely and go straight to the name-based lookup. When inserting a new artist with no MBID, omit the `mbid` field and set `data_source: "genius"`.

All existing call sites pass MB artists with string IDs — no behavior change for them.

---

## enrich-song.ts changes

Replace the opening block with:

```typescript
// 1. Try Genius first
if (process.env.GENIUS_ACCESS_TOKEN) {
  const { enrichSongGenius } = await import("@/lib/genius/enrich-song-genius");
  const foundViaGenius = await enrichSongGenius(supabase, songUuid);
  if (foundViaGenius) {
    await supabase.from("tracks")
      .update({ credits_enriched_at: new Date().toISOString() })
      .eq("id", songUuid);
    return;
  }
}

// 2. Fall back to MusicBrainz (existing logic unchanged below)
```

The rest of `enrich-song.ts` is unchanged. The `foundCredits` flag and `staleSoonTimestamp` logic at the end still apply for the MB fallback path.

---

## Environment Variables

```
GENIUS_ACCESS_TOKEN=   # client access token from genius.com/api-clients
```

Added to `.env.example`. If absent, Genius step is silently skipped and MB runs as before — zero breaking change for existing deployments.

---

## Error Handling

- `GENIUS_ACCESS_TOKEN` absent → skip Genius entirely, no error
- Search returns no hits → return false, fall through to MB
- Match verification fails → return false, fall through to MB  
- `fetchGeniusSong` returns null (404 or network error) → return false, fall through to MB
- Duplicate insert (23505) → ignored, same as MB path
- Any unhandled Genius error → log warning, return false, fall through to MB (never block the MB path)

---

## package.json workspace registration

Add `"@tracklist/genius-client": "*"` as a dependency in the root `package.json` and add `"packages/genius-client"` to the workspaces array (same pattern as `musicbrainz-client`).
