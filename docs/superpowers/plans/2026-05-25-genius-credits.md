# Genius Credits Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Genius as the primary credits source for songs (producers, songwriters, featured artists), falling back to MusicBrainz when Genius finds no match.

**Architecture:** New `packages/genius-client/` workspace package handles Genius HTTP calls with Bottleneck rate limiting. New `lib/genius/enrich-song-genius.ts` does search→match→insert. `lib/musicbrainz/upsert-credit-artist.ts` is updated to accept optional MBID so Genius-sourced artists can be upserted by name. `lib/musicbrainz/enrich-song.ts` gains a Genius-first block before its existing MB logic.

**Tech Stack:** Genius REST API (`https://api.genius.com`), Bottleneck 2.x, Supabase admin client, Vitest for unit tests.

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `packages/genius-client/package.json` | Package metadata |
| Create | `packages/genius-client/src/index.ts` | HTTP client + types for Genius API |
| Create | `lib/genius/enrich-song-genius.ts` | Search, match, extract, insert credits |
| Create | `lib/genius/enrich-song-genius.test.ts` | Unit tests for match utility functions |
| Modify | `lib/musicbrainz/upsert-credit-artist.ts` | Make MBID optional (string \| null) |
| Modify | `lib/musicbrainz/enrich-song.ts` | Add Genius-first block before MB logic |
| Modify | `package.json` | Add `@tracklist/genius-client` dependency |
| Modify | `.env.example` | Document `GENIUS_ACCESS_TOKEN` |

---

## Task 1: genius-client package

**Files:**
- Create: `packages/genius-client/package.json`
- Create: `packages/genius-client/src/index.ts`
- Modify: `package.json` (root)
- Modify: `.env.example`

### Context

`packages/musicbrainz-client/` is the pattern to follow — a workspace package with `"private": true`, `"main": "./src/index.ts"`, and Bottleneck for rate limiting. The root `package.json` already has `"workspaces": ["packages/*"]` so the directory is auto-discovered; you just need to add the package as a dependency.

Genius API:
- Base: `https://api.genius.com`
- Auth: `Authorization: Bearer {GENIUS_ACCESS_TOKEN}` header
- `GET /search?q=<query>` → `{ response: { hits: GeniusSearchHit[] } }`
- `GET /songs/:id` → `{ response: { song: GeniusSong } }`

- [ ] **Step 1: Create packages/genius-client/package.json**

```json
{
  "name": "@tracklist/genius-client",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "bottleneck": "^2.19.5"
  }
}
```

- [ ] **Step 2: Create packages/genius-client/src/index.ts**

```typescript
import Bottleneck from "bottleneck";

const GENIUS_BASE = "https://api.genius.com";
const limiter = new Bottleneck({ minTime: 200, maxConcurrent: 1 });

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

async function geniusFetchOnce<T>(path: string): Promise<T | null> {
  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) return null;
  const url = `${GENIUS_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Genius ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

const geniusFetchLimited = limiter.wrap(geniusFetchOnce) as <T>(path: string) => Promise<T | null>;

export async function searchGenius(q: string): Promise<GeniusSearchHit[]> {
  if (!process.env.GENIUS_ACCESS_TOKEN) return [];
  try {
    const data = await geniusFetchLimited<{ response: { hits: GeniusSearchHit[] } }>(
      `/search?q=${encodeURIComponent(q)}`,
    );
    return data?.response?.hits ?? [];
  } catch (err) {
    console.warn("[genius-client] searchGenius error:", (err as Error).message);
    return [];
  }
}

export async function fetchGeniusSong(id: number): Promise<GeniusSong | null> {
  if (!process.env.GENIUS_ACCESS_TOKEN) return null;
  try {
    const data = await geniusFetchLimited<{ response: { song: GeniusSong } }>(`/songs/${id}`);
    return data?.response?.song ?? null;
  } catch (err) {
    console.warn("[genius-client] fetchGeniusSong error:", (err as Error).message);
    return null;
  }
}
```

- [ ] **Step 3: Add @tracklist/genius-client to root package.json dependencies**

Open `package.json`. Find the `"dependencies"` block where `"@tracklist/musicbrainz-client"` is listed. Add the genius client on the next line:

```json
"@tracklist/genius-client": "*",
"@tracklist/musicbrainz-client": "*",
```

- [ ] **Step 4: Document GENIUS_ACCESS_TOKEN in .env.example**

Open `.env.example`. Find the `RESEND_API_KEY=` line near the bottom. Add above it:

```
# Genius API — client access token from https://genius.com/api-clients
# Used as primary credits source for songs (producers, songwriters, featured artists).
# Optional: if absent, enrichment falls back to MusicBrainz only.
GENIUS_ACCESS_TOKEN=
```

- [ ] **Step 5: Install workspace**

```bash
npm install
```

Expected: `added N packages` (or "up to date") — no errors. The `@tracklist/genius-client` package is now symlinked into `node_modules`.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/genius-client/ package.json package-lock.json .env.example
git commit -m "feat: add genius-client workspace package"
```

---

## Task 2: Make MBID optional in upsert-credit-artist

**Files:**
- Modify: `lib/musicbrainz/upsert-credit-artist.ts`

### Context

Currently `upsertCreditArtist` takes `MbArtist` which has a required `id: string` (the MusicBrainz ID). Genius artists have no MBID. The change: replace the `MbArtist` input type with `CreditArtist { id: string | null; name: string }`. When `id` is null, skip the MBID lookup and go straight to name matching. When inserting a new artist with no MBID, omit the `mbid` column and set `data_source: "genius"`.

All existing call sites in `enrich-song.ts`, `enrich-album.ts`, and `enrich-artist.ts` pass `rel.artist` which is `MbArtist` with `id: string` — TypeScript will still accept this since `string` is assignable to `string | null`.

- [ ] **Step 1: Replace the full contents of lib/musicbrainz/upsert-credit-artist.ts**

```typescript
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CreditArtist {
  id: string | null; // MBID when known; null for Genius-sourced artists
  name: string;
}

export interface CreditArtistFlags {
  isProducer?: boolean;
  isSongwriter?: boolean;
}

export async function upsertCreditArtist(
  supabase: SupabaseClient,
  artist: CreditArtist,
  flags: CreditArtistFlags = {},
): Promise<string> {
  // Look up by MBID first — only when MBID is available
  if (artist.id) {
    const { data: byMbid } = await supabase
      .from("artists")
      .select("id, is_producer, is_songwriter")
      .eq("mbid", artist.id)
      .maybeSingle();

    if (byMbid) {
      const updates: Record<string, boolean> = {};
      if (flags.isProducer && !byMbid.is_producer) updates.is_producer = true;
      if (flags.isSongwriter && !byMbid.is_songwriter) updates.is_songwriter = true;
      if (Object.keys(updates).length) {
        const { error: updateErr } = await supabase.from("artists").update(updates).eq("id", byMbid.id);
        if (updateErr) console.warn("[upsert-credit-artist] byMbid update failed", byMbid.id, updateErr.message);
      }
      return byMbid.id as string;
    }
  }

  // Check by name (case-insensitive) — may already exist as a performer
  const { data: byName } = await supabase
    .from("artists")
    .select("id")
    .ilike("name", artist.name)
    .maybeSingle();

  if (byName) {
    const updates: Record<string, unknown> = {};
    if (artist.id) updates.mbid = artist.id;
    if (flags.isProducer) updates.is_producer = true;
    if (flags.isSongwriter) updates.is_songwriter = true;
    if (Object.keys(updates).length) {
      const { error: updateErr } = await supabase.from("artists").update(updates).eq("id", byName.id);
      if (updateErr) console.warn("[upsert-credit-artist] byName update failed", byName.id, updateErr.message);
    }
    return byName.id as string;
  }

  // Insert new artist record
  const insertData: Record<string, unknown> = {
    name: artist.name,
    data_source: artist.id ? "musicbrainz" : "genius",
    is_producer: flags.isProducer ?? false,
    is_songwriter: flags.isSongwriter ?? false,
  };
  if (artist.id) insertData.mbid = artist.id;

  const { data, error } = await supabase
    .from("artists")
    .insert(insertData)
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Race: another concurrent enrichment inserted this artist first
      if (artist.id) {
        const { data: existing } = await supabase.from("artists").select("id").eq("mbid", artist.id).maybeSingle();
        if (existing) return existing.id as string;
      }
      const { data: existingByName } = await supabase
        .from("artists")
        .select("id")
        .ilike("name", artist.name)
        .maybeSingle();
      if (existingByName) return existingByName.id as string;
    }
    throw new Error(`upsertCreditArtist failed: ${error.message}`);
  }
  return data.id as string;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors. The existing callers in `enrich-song.ts`, `enrich-album.ts`, `enrich-artist.ts` pass `rel.artist` (which has `id: string`). TypeScript accepts `string` as `string | null` — no changes to those files needed.

- [ ] **Step 3: Commit**

```bash
git add lib/musicbrainz/upsert-credit-artist.ts
git commit -m "refactor: make MBID optional in upsertCreditArtist to support Genius-sourced artists"
```

---

## Task 3: enrich-song-genius.ts + unit tests

**Files:**
- Create: `lib/genius/enrich-song-genius.ts`
- Create: `lib/genius/enrich-song-genius.test.ts`

### Context

The match verification functions (`normalizeTitle`, `isTitleMatch`, `isArtistMatch`) are exported so they can be unit tested. The main `enrichSongGenius` function is not unit tested (would require mocking Supabase + Genius API); the integration is validated manually by checking a known song.

The Supabase query to get artist name uses a two-step approach: first fetch `tracks` with `artist_id` and `lastfm_artist_name`, then fetch the artist name separately. This avoids relying on PostgREST join syntax which can be fragile.

The `track_featuring_artists` table has columns `track_id` and `artist_id`.

Vitest is configured to alias `server-only` to an empty mock, so `import "server-only"` at the top of the file is safe in tests.

- [ ] **Step 1: Write the failing tests**

Create `lib/genius/enrich-song-genius.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { normalizeTitle, isTitleMatch, isArtistMatch } from "./enrich-song-genius";

describe("normalizeTitle", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeTitle("HUMBLE.")).toBe("humble");
  });

  it("strips parenthetical feat", () => {
    expect(normalizeTitle("You're Stuck (feat. Summer Walker)")).toBe("youre stuck");
  });

  it("strips bracketed feat", () => {
    expect(normalizeTitle("Money Trees [feat. Jay Rock]")).toBe("money trees");
  });

  it("collapses extra whitespace", () => {
    expect(normalizeTitle("  hello   world  ")).toBe("hello world");
  });

  it("strips apostrophes and special chars", () => {
    expect(normalizeTitle("Can't Stop the Feeling!")).toBe("cant stop the feeling");
  });
});

describe("isTitleMatch", () => {
  it("matches identical titles after normalization", () => {
    expect(isTitleMatch("HUMBLE.", "HUMBLE.")).toBe(true);
  });

  it("matches when track has feat and Genius does not", () => {
    expect(isTitleMatch("You're Stuck (feat. Summer Walker)", "You're Stuck")).toBe(true);
  });

  it("matches when Genius has feat and track does not", () => {
    expect(isTitleMatch("Money Trees", "Money Trees (feat. Jay Rock)")).toBe(true);
  });

  it("does not match different songs", () => {
    expect(isTitleMatch("DNA.", "HUMBLE.")).toBe(false);
  });

  it("does not match short title that is a substring of a different title", () => {
    // "god" is a substring of "gods plan" — but too short to be a reliable match
    expect(isTitleMatch("God", "God's Plan")).toBe(false);
  });
});

describe("isArtistMatch", () => {
  it("matches identical artist names", () => {
    expect(isArtistMatch("Kendrick Lamar", "Kendrick Lamar")).toBe(true);
  });

  it("matches when one is substring of the other", () => {
    expect(isArtistMatch("SZA", "SZA")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isArtistMatch("drake", "Drake")).toBe(true);
  });

  it("does not match different artists", () => {
    expect(isArtistMatch("Drake", "Kendrick Lamar")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test:unit -- --reporter=verbose lib/genius/enrich-song-genius.test.ts
```

Expected: FAIL — `Cannot find module './enrich-song-genius'`

- [ ] **Step 3: Create lib/genius/enrich-song-genius.ts**

```typescript
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { searchGenius, fetchGeniusSong } from "@tracklist/genius-client";
import { upsertCreditArtist } from "@/lib/musicbrainz/upsert-credit-artist";

export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s*\(feat\..*?\)/gi, "")
    .replace(/\s*\[feat\..*?\]/gi, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isTitleMatch(trackTitle: string, geniusTitle: string): boolean {
  const a = normalizeTitle(trackTitle);
  const b = normalizeTitle(geniusTitle);
  if (a === b) return true;
  // Only use substring matching when the shorter string is long enough to be
  // a reliable signal — prevents "god" from matching "gods plan"
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 6 && longer.includes(shorter);
}

export function isArtistMatch(trackArtist: string, geniusArtist: string): boolean {
  const a = trackArtist.toLowerCase().trim();
  const b = geniusArtist.toLowerCase().trim();
  return a.includes(b) || b.includes(a);
}

export async function enrichSongGenius(
  supabase: SupabaseClient,
  songUuid: string,
): Promise<boolean> {
  // Fetch track name and artist_id
  const { data: track } = await supabase
    .from("tracks")
    .select("name, artist_id, lastfm_artist_name")
    .eq("id", songUuid)
    .maybeSingle();

  if (!track) return false;

  const trackName = track.name as string;

  // Resolve artist name: try artists table first, fall back to lastfm_artist_name
  let artistName: string | null = null;
  if (track.artist_id) {
    const { data: artist } = await supabase
      .from("artists")
      .select("name")
      .eq("id", track.artist_id)
      .maybeSingle();
    if (artist) artistName = artist.name as string;
  }
  if (!artistName) artistName = (track.lastfm_artist_name as string | null) ?? null;

  const query = artistName ? `${trackName} ${artistName}` : trackName;

  // Search Genius
  const hits = await searchGenius(query);
  const songHits = hits.filter((h) => h.type === "song");

  // Find first hit that passes match verification
  const match = songHits.find((h) => {
    const titleOk = isTitleMatch(trackName, h.result.title);
    const artistOk = artistName ? isArtistMatch(artistName, h.result.primary_artist.name) : true;
    return titleOk && artistOk;
  });

  if (!match) return false;

  const song = await fetchGeniusSong(match.result.id);
  if (!song) return false;

  let foundCredits = false;

  for (const a of song.producer_artists) {
    const artistId = await upsertCreditArtist(supabase, { id: null, name: a.name }, { isProducer: true });
    const { error } = await supabase.from("song_producers").insert({ song_id: songUuid, artist_id: artistId });
    if (!error) foundCredits = true;
    else if (error.code !== "23505") console.warn("[enrich-song-genius] song_producers insert error", error.message);
  }

  for (const a of song.writer_artists) {
    const artistId = await upsertCreditArtist(supabase, { id: null, name: a.name }, { isSongwriter: true });
    const { error } = await supabase.from("song_songwriters").insert({ song_id: songUuid, artist_id: artistId });
    if (!error) foundCredits = true;
    else if (error.code !== "23505") console.warn("[enrich-song-genius] song_songwriters insert error", error.message);
  }

  for (const a of song.featured_artists) {
    const artistId = await upsertCreditArtist(supabase, { id: null, name: a.name }, {});
    const { error } = await supabase.from("track_featuring_artists").insert({ track_id: songUuid, artist_id: artistId });
    if (!error) foundCredits = true;
    else if (error.code !== "23505") console.warn("[enrich-song-genius] track_featuring_artists insert error", error.message);
  }

  return foundCredits;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test:unit -- --reporter=verbose lib/genius/enrich-song-genius.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/genius/
git commit -m "feat: add enrichSongGenius — Genius-backed song credits enrichment"
```

---

## Task 4: Wire Genius into enrich-song.ts

**Files:**
- Modify: `lib/musicbrainz/enrich-song.ts`

### Context

`lib/musicbrainz/enrich-song.ts` currently: fetches track → checks staleness → resolves MBID → hits MusicBrainz. The Genius block goes after the staleness check (line ~49, after `if (!creditsStale && !needsRetry) return;`) and before the MBID resolution block. If Genius finds credits, stamp the timestamp and return early. If not, fall through to the existing MB logic unchanged.

The entire existing MB flow (MBID resolution, `fetchMbRecording`, work-rels traversal for songwriters, `staleSoonTimestamp` for no-credits case) remains exactly as-is.

- [ ] **Step 1: Add the Genius block to enrich-song.ts**

Open `lib/musicbrainz/enrich-song.ts`. Find this exact block (around line 49):

```typescript
  if (!creditsStale && !needsRetry) return;

  // Resolve MBID
  let mbid = track.mbid as string | null;
```

Replace it with:

```typescript
  if (!creditsStale && !needsRetry) return;

  // Try Genius first — faster resolution, better coverage for recent releases
  if (process.env.GENIUS_ACCESS_TOKEN) {
    const { enrichSongGenius } = await import("@/lib/genius/enrich-song-genius");
    const foundViaGenius = await enrichSongGenius(supabase, songUuid);
    if (foundViaGenius) {
      await supabase.from("tracks").update({ credits_enriched_at: new Date().toISOString() }).eq("id", songUuid);
      return;
    }
  }

  // Resolve MBID
  let mbid = track.mbid as string | null;
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/musicbrainz/enrich-song.ts
git commit -m "feat: try Genius first in enrichSong, fall back to MusicBrainz"
```

---

## Manual Smoke Test

After all tasks are done, set `GENIUS_ACCESS_TOKEN` in your `.env` (get a client token from genius.com/api-clients), then:

- [ ] **Reset a song that has no credits so it re-enriches:**

```sql
UPDATE tracks
SET credits_enriched_at = NULL
WHERE id = '3e71fc5f-f566-40f0-95a9-6015a281ceee';
```

- [ ] **Run backfill for just that one song** (or visit the page — `after()` will trigger enrichment):

```bash
BACKFILL_TOP_N=5 npm run backfill:musicbrainz-credits
```

Watch the output — you should see `[genius-client]` or `[enrich-song-genius]` log lines if Genius runs.

- [ ] **Verify credits in DB:**

```bash
set -a && source .env && set +a && NODE_OPTIONS='-r ./scripts/register-server-only-stub.cjs' npx tsx scripts/debug-song.ts
```

Expected: `producers`, `songwriters`, or `featuring` arrays now populated (if Genius has data for that song).

- [ ] **Also run the SQL reset for all stale no-credits songs:**

```sql
UPDATE tracks t
SET credits_enriched_at = NULL
WHERE t.mbid IS NOT NULL
  AND t.credits_enriched_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM song_producers WHERE song_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM song_songwriters WHERE song_id = t.id);
```

Then `npm run backfill:musicbrainz-credits` to re-enrich with the new Genius-first pipeline.
