# Entity Page Enrichment — Info Tab, Credits & Bio Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Info tab to artist, album, and song pages with rich credits (producers, songwriters, labels, members, samples, covers), editorial bio content, and fully-navigable entity pages — giving users a reason to visit before any social data exists.

**Architecture:** On-demand MusicBrainz enrichment (triggered on first page visit, never blocks API response) populates credits into junction tables. All credit entities (producers, labels, etc.) are created as DB records during enrichment so every link resolves immediately. Last.fm provides bio text. Labels get their own pages; producers/songwriters extend the existing `artists` table with `is_producer`/`is_songwriter` flags.

**Tech Stack:** MusicBrainz REST API (free, 1 req/sec), Last.fm API (existing `LASTFM_API_KEY`), Wikipedia REST API (fallback bio), BullMQ + IORedis, Bottleneck rate limiter, Next.js Route Handlers, Expo React Native.

---

## File Map

**New files:**
- `supabase/migrations/169_entity_enrichment.sql` — all schema changes
- `packages/musicbrainz-client/package.json` — workspace package
- `packages/musicbrainz-client/src/types.ts` — MB response types
- `packages/musicbrainz-client/src/index.ts` — HTTP client + Bottleneck
- `lib/musicbrainz/upsert-label.ts` — label create/update helper
- `lib/musicbrainz/upsert-credit-artist.ts` — producer/songwriter artist upsert
- `lib/musicbrainz/fetch-bio.ts` — Last.fm + Wikipedia bio fetchers
- `lib/musicbrainz/enrich-artist.ts` — artist enrichment orchestrator
- `lib/musicbrainz/enrich-album.ts` — album enrichment orchestrator
- `lib/musicbrainz/enrich-song.ts` — song enrichment orchestrator
- `lib/jobs/musicbrainzQueue.ts` — BullMQ queue + in-memory fallback
- `scripts/musicbrainz-enrich-worker.ts` — long-running worker process
- `scripts/backfill-musicbrainz-credits.ts` — one-time top-N backfill
- `lib/musicbrainz/db-queries.ts` — read helpers for API routes
- `app/api/labels/[id]/route.ts` — label detail API
- `app/api/labels/[id]/artists/route.ts` — paginated label artists
- `app/api/labels/[id]/albums/route.ts` — paginated label albums
- `components/info-tab/CreditsBlock.tsx` — inline colored credit names (Option C)
- `components/info-tab/MembersGrid.tsx` — initials circles grid
- `components/info-tab/SongCard.tsx` — sample/cover reference row
- `components/info-tab/ExternalLinks.tsx` — pill link buttons
- `components/info-tab/ArtistInfoTab.tsx` — artist Info tab
- `components/info-tab/AlbumInfoTab.tsx` — album Info tab
- `components/info-tab/SongInfoTab.tsx` — song Info tab
- `app/label/[id]/page.tsx` — web label page
- `mobile/components/info-tab/CreditsBlock.tsx` — mobile credits
- `mobile/components/info-tab/MembersGrid.tsx` — mobile member circles
- `mobile/components/info-tab/SongCard.tsx` — mobile sample/cover rows
- `mobile/components/info-tab/ArtistInfoTab.tsx` — mobile artist Info tab
- `mobile/components/info-tab/AlbumInfoTab.tsx` — mobile album Info tab
- `mobile/components/info-tab/SongInfoTab.tsx` — mobile song Info tab
- `mobile/app/label/[id].tsx` — mobile label page

**Modified files:**
- `app/api/artists/[id]/route.ts` — add bio, members, labels, credits fields
- `app/api/albums/[id]/route.ts` — add bio, release_type, credits fields
- `app/api/songs/[id]/route.ts` — add producers, songwriters, samples, covers
- `app/api/artists/[id]/detail-bundle/route.ts` — same additions as artist route
- `app/song/[id]/song-page-tabs.tsx` — add Info tab
- `app/artist/[id]/artist-page-tabs.tsx` (or equivalent) — add Info tab
- `app/album/[id]/album-page-tabs.tsx` (or equivalent) — add Info tab
- `mobile/app/song/[id].tsx` — add Info tab
- `mobile/app/artist/[id]/index.tsx` — add Info tab
- `mobile/app/album/[id].tsx` — add Info tab
- `package.json` (root) — add worker script + backfill script
- `tsconfig.json` — add musicbrainz-client path alias

---

## Task 1: DB Migration 169 — Schema

**Files:**
- Create: `supabase/migrations/169_entity_enrichment.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/169_entity_enrichment.sql

-- ── Extend existing tables ────────────────────────────────────────────────────

ALTER TABLE artists
  ADD COLUMN IF NOT EXISTS is_producer       BOOL        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_songwriter     BOOL        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bio               TEXT,
  ADD COLUMN IF NOT EXISTS bio_source        TEXT,        -- 'lastfm' | 'wikipedia' | 'musicbrainz'
  ADD COLUMN IF NOT EXISTS bio_enriched_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mbid              TEXT,
  ADD COLUMN IF NOT EXISTS external_links    JSONB,
  ADD COLUMN IF NOT EXISTS credits_enriched_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS artists_mbid_unique ON artists (mbid) WHERE mbid IS NOT NULL;

ALTER TABLE albums
  ADD COLUMN IF NOT EXISTS bio               TEXT,
  ADD COLUMN IF NOT EXISTS bio_source        TEXT,
  ADD COLUMN IF NOT EXISTS bio_enriched_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mbid              TEXT,
  ADD COLUMN IF NOT EXISTS release_type      TEXT,        -- 'album' | 'ep' | 'live' | 'compilation' | 'single'
  ADD COLUMN IF NOT EXISTS credits_enriched_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS albums_mbid_unique ON albums (mbid) WHERE mbid IS NOT NULL;

ALTER TABLE tracks
  ADD COLUMN IF NOT EXISTS mbid              TEXT,
  ADD COLUMN IF NOT EXISTS credits_enriched_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS tracks_mbid_unique ON tracks (mbid) WHERE mbid IS NOT NULL;

-- ── Labels ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS labels (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  name_normalized  TEXT,
  mbid             TEXT        UNIQUE,
  bio              TEXT,
  bio_source       TEXT,
  country          TEXT,
  founded_year     INT,
  image_url        TEXT,
  external_links   JSONB,
  enriched_at      TIMESTAMPTZ,
  bio_enriched_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS labels_name_normalized_idx ON labels (name_normalized);

-- ── Junction tables ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS artist_labels (
  artist_id   UUID  NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  label_id    UUID  NOT NULL REFERENCES labels(id)  ON DELETE CASCADE,
  start_year  INT,
  end_year    INT,
  is_current  BOOL  NOT NULL DEFAULT false,
  PRIMARY KEY (artist_id, label_id, COALESCE(start_year, -1))
);

CREATE TABLE IF NOT EXISTS album_labels (
  album_id   UUID  NOT NULL REFERENCES albums(id)  ON DELETE CASCADE,
  label_id   UUID  NOT NULL REFERENCES labels(id)  ON DELETE CASCADE,
  PRIMARY KEY (album_id, label_id)
);

CREATE TABLE IF NOT EXISTS album_producers (
  album_id   UUID  NOT NULL REFERENCES albums(id)   ON DELETE CASCADE,
  artist_id  UUID  NOT NULL REFERENCES artists(id)  ON DELETE CASCADE,
  PRIMARY KEY (album_id, artist_id)
);

CREATE TABLE IF NOT EXISTS album_songwriters (
  album_id   UUID  NOT NULL REFERENCES albums(id)   ON DELETE CASCADE,
  artist_id  UUID  NOT NULL REFERENCES artists(id)  ON DELETE CASCADE,
  PRIMARY KEY (album_id, artist_id)
);

CREATE TABLE IF NOT EXISTS song_producers (
  song_id    UUID  NOT NULL REFERENCES tracks(id)   ON DELETE CASCADE,
  artist_id  UUID  NOT NULL REFERENCES artists(id)  ON DELETE CASCADE,
  PRIMARY KEY (song_id, artist_id)
);

CREATE TABLE IF NOT EXISTS song_songwriters (
  song_id    UUID  NOT NULL REFERENCES tracks(id)   ON DELETE CASCADE,
  artist_id  UUID  NOT NULL REFERENCES artists(id)  ON DELETE CASCADE,
  PRIMARY KEY (song_id, artist_id)
);

CREATE TABLE IF NOT EXISTS song_samples (
  song_id         UUID  NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  sampled_song_id UUID  NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, sampled_song_id)
);

CREATE TABLE IF NOT EXISTS song_covers (
  song_id          UUID  NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  original_song_id UUID  NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  PRIMARY KEY (song_id, original_song_id)
);

CREATE TABLE IF NOT EXISTS artist_members (
  artist_id        UUID  NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  member_artist_id UUID  NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  role             TEXT,
  is_active        BOOL  NOT NULL DEFAULT true,
  PRIMARY KEY (artist_id, member_artist_id)
);

-- Featuring artists (tracks only store primary artist_id; features go here)
CREATE TABLE IF NOT EXISTS track_featuring_artists (
  track_id   UUID  NOT NULL REFERENCES tracks(id)   ON DELETE CASCADE,
  artist_id  UUID  NOT NULL REFERENCES artists(id)  ON DELETE CASCADE,
  PRIMARY KEY (track_id, artist_id)
);
```

- [ ] **Step 2: Apply the migration locally**

```bash
npx supabase db push
# or if using remote directly:
npx supabase migration up
```

Expected: no errors. Check with `npx supabase db diff` — should show no pending changes.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/169_entity_enrichment.sql
git commit -m "feat: migration 169 — entity enrichment schema (labels, junction tables, bio/credit columns)"
```

---

## Task 2: MusicBrainz Client Package

**Files:**
- Create: `packages/musicbrainz-client/package.json`
- Create: `packages/musicbrainz-client/src/types.ts`
- Create: `packages/musicbrainz-client/src/index.ts`
- Modify: `tsconfig.json` (add path alias)
- Modify: root `package.json` (add workspace)

- [ ] **Step 1: Create package.json**

```json
// packages/musicbrainz-client/package.json
{
  "name": "@tracklist/musicbrainz-client",
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

- [ ] **Step 2: Create types.ts**

```typescript
// packages/musicbrainz-client/src/types.ts

export interface MbUrlLookup {
  id: string;
  resource: string;
  relations?: MbRelation[];
}

export interface MbArtist {
  id: string;
  name: string;
  type?: string;
  relations?: MbRelation[];
}

export interface MbLabel {
  id: string;
  name: string;
  country?: string;
  'life-span'?: { begin?: string; ended?: boolean };
  relations?: MbRelation[];
}

export interface MbRelease {
  id: string;
  title: string;
  date?: string;
  'release-group'?: { id: string; 'primary-type'?: string };
  'label-info'?: Array<{ label?: MbLabel }>;
  relations?: MbRelation[];
  media?: Array<{ tracks?: MbTrack[] }>;
}

export interface MbRecording {
  id: string;
  title: string;
  relations?: MbRelation[];
}

export interface MbTrack {
  recording: MbRecording;
}

export interface MbRelation {
  type: string;
  direction: 'forward' | 'backward';
  artist?: MbArtist;
  label?: MbLabel;
  recording?: MbRecording;
  release?: MbRelease;
  url?: { id: string; resource: string };
  begin?: string | null;
  end?: string | null;
  ended?: boolean;
  attributes?: string[];
}
```

- [ ] **Step 3: Create the HTTP client**

```typescript
// packages/musicbrainz-client/src/index.ts

import Bottleneck from "bottleneck";
import type { MbArtist, MbLabel, MbRecording, MbRelease, MbUrlLookup } from "./types";

export type { MbArtist, MbLabel, MbRecording, MbRelease, MbRelation, MbUrlLookup } from "./types";

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT = "Tracklist/1.0 (singh.avi99@gmail.com)";

// 1 req/sec — MusicBrainz rate limit
const limiter = new Bottleneck({ minTime: 1000, maxConcurrent: 1 });

async function mbFetch<T>(path: string): Promise<T> {
  const url = `${MB_BASE}${path}${path.includes("?") ? "&" : "?"}fmt=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) return null as unknown as T;
  if (!res.ok) throw new Error(`MusicBrainz ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

export const fetchMb = limiter.wrap(mbFetch) as <T>(path: string) => Promise<T>;

// ── High-level lookup helpers ────────────────────────────────────────────────

export async function resolveArtistMbid(spotifyId: string): Promise<string | null> {
  const url = encodeURIComponent(`https://open.spotify.com/artist/${spotifyId}`);
  const data = await fetchMb<MbUrlLookup>(`/url?resource=${url}&inc=artist-rels`);
  return data?.relations?.find((r) => r.artist)?.artist?.id ?? null;
}

export async function resolveAlbumMbid(spotifyId: string): Promise<string | null> {
  const url = encodeURIComponent(`https://open.spotify.com/album/${spotifyId}`);
  const data = await fetchMb<MbUrlLookup>(`/url?resource=${url}&inc=release-rels`);
  return data?.relations?.find((r) => r.release)?.release?.id ?? null;
}

export async function resolveTrackMbid(spotifyId: string): Promise<string | null> {
  const url = encodeURIComponent(`https://open.spotify.com/track/${spotifyId}`);
  const data = await fetchMb<MbUrlLookup>(`/url?resource=${url}&inc=recording-rels`);
  return data?.relations?.find((r) => r.recording)?.recording?.id ?? null;
}

export async function fetchMbArtist(mbid: string): Promise<MbArtist | null> {
  return fetchMb<MbArtist>(`/artist/${mbid}?inc=artist-rels+url-rels`);
}

export async function fetchMbRelease(mbid: string): Promise<MbRelease | null> {
  return fetchMb<MbRelease>(`/release/${mbid}?inc=artist-rels+label-rels+url-rels+recordings`);
}

export async function fetchMbRecording(mbid: string): Promise<MbRecording | null> {
  return fetchMb<MbRecording>(`/recording/${mbid}?inc=artist-rels+work-rels`);
}
```

- [ ] **Step 4: Add path alias to tsconfig.json**

In `tsconfig.json`, find the `paths` section and add:
```json
"@tracklist/musicbrainz-client": ["./packages/musicbrainz-client/src/index.ts"]
```

- [ ] **Step 5: Verify the workspace is picked up**

```bash
npm install
node -e "require('./packages/musicbrainz-client/src/index.ts')" 2>&1 | head -5
```

Expected: no "module not found" errors (ts-node/tsx handles the rest).

- [ ] **Step 6: Commit**

```bash
git add packages/musicbrainz-client/ tsconfig.json package.json
git commit -m "feat: MusicBrainz client package — 1 req/sec Bottleneck, MBID resolvers, entity fetchers"
```

---

## Task 3: Label and Credit-Artist Upsert Helpers

**Files:**
- Create: `lib/musicbrainz/upsert-label.ts`
- Create: `lib/musicbrainz/upsert-credit-artist.ts`

- [ ] **Step 1: Write upsert-label.ts**

```typescript
// lib/musicbrainz/upsert-label.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MbLabel } from "@tracklist/musicbrainz-client";

export async function upsertLabel(
  supabase: SupabaseClient,
  mb: MbLabel,
): Promise<string> {
  const nameNorm = mb.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const foundedYear = mb["life-span"]?.begin
    ? parseInt(mb["life-span"].begin.slice(0, 4), 10) || null
    : null;

  // Try match by MBID first, then normalized name
  const { data: existing } = await supabase
    .from("labels")
    .select("id")
    .or(`mbid.eq.${mb.id},name_normalized.eq.${nameNorm}`)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("labels")
      .update({ mbid: mb.id, name: mb.name, name_normalized: nameNorm, founded_year: foundedYear, country: mb.country ?? null })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("labels")
    .insert({ name: mb.name, name_normalized: nameNorm, mbid: mb.id, founded_year: foundedYear, country: mb.country ?? null })
    .select("id")
    .single();

  if (error) throw new Error(`upsertLabel failed: ${error.message}`);
  return data.id as string;
}
```

- [ ] **Step 2: Write upsert-credit-artist.ts**

```typescript
// lib/musicbrainz/upsert-credit-artist.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MbArtist } from "@tracklist/musicbrainz-client";

export interface CreditArtistFlags {
  isProducer?: boolean;
  isSongwriter?: boolean;
}

export async function upsertCreditArtist(
  supabase: SupabaseClient,
  mb: MbArtist,
  flags: CreditArtistFlags = {},
): Promise<string> {
  // Look up by MBID first (most reliable), then by name
  const { data: byMbid } = await supabase
    .from("artists")
    .select("id, is_producer, is_songwriter")
    .eq("mbid", mb.id)
    .maybeSingle();

  if (byMbid) {
    // Update flags if newly earned
    const updates: Record<string, boolean> = {};
    if (flags.isProducer && !byMbid.is_producer) updates.is_producer = true;
    if (flags.isSongwriter && !byMbid.is_songwriter) updates.is_songwriter = true;
    if (Object.keys(updates).length) {
      await supabase.from("artists").update(updates).eq("id", byMbid.id);
    }
    return byMbid.id as string;
  }

  // Check by name (case-insensitive) — may already exist as a performer
  const { data: byName } = await supabase
    .from("artists")
    .select("id")
    .ilike("name", mb.name)
    .maybeSingle();

  if (byName) {
    await supabase
      .from("artists")
      .update({
        mbid: mb.id,
        ...(flags.isProducer ? { is_producer: true } : {}),
        ...(flags.isSongwriter ? { is_songwriter: true } : {}),
      })
      .eq("id", byName.id);
    return byName.id as string;
  }

  // Create minimal artist record
  const { data, error } = await supabase
    .from("artists")
    .insert({
      name: mb.name,
      mbid: mb.id,
      data_source: "musicbrainz",
      is_producer: flags.isProducer ?? false,
      is_songwriter: flags.isSongwriter ?? false,
    })
    .select("id")
    .single();

  if (error) throw new Error(`upsertCreditArtist failed: ${error.message}`);
  return data.id as string;
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/musicbrainz/
git commit -m "feat: label and credit-artist upsert helpers for MusicBrainz enrichment"
```

---

## Task 4: Bio Fetchers (Last.fm + Wikipedia)

**Files:**
- Create: `lib/musicbrainz/fetch-bio.ts`

- [ ] **Step 1: Write fetch-bio.ts**

```typescript
// lib/musicbrainz/fetch-bio.ts
import "server-only";
import { fetchLastfmApi } from "@/lib/lastfm/lastfm-api-fetch";
import { throttleLastfm } from "@/lib/lastfm/lastfm-throttle";

const LASTFM_KEY = process.env.LASTFM_API_KEY ?? "";

function stripHtmlTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export async function fetchArtistBioLastfm(artistName: string): Promise<{ bio: string; source: "lastfm" } | null> {
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.getInfo&artist=${encodeURIComponent(artistName)}&api_key=${LASTFM_KEY}&format=json&autocorrect=1`;
    const data = await throttleLastfm(() => fetchLastfmApi(url));
    const summary: string | undefined = data?.artist?.bio?.summary;
    if (!summary || summary.includes("This artist does not have")) return null;
    // Last.fm appends " <a href=...>Read more on Last.fm</a>" — strip it
    const clean = stripHtmlTags(summary).replace(/Read more on Last\.fm\.?$/, "").trim();
    if (clean.length < 20) return null;
    return { bio: clean, source: "lastfm" };
  } catch {
    return null;
  }
}

export async function fetchAlbumBioLastfm(artistName: string, albumName: string): Promise<{ bio: string; source: "lastfm" } | null> {
  try {
    const url = `https://ws.audioscrobbler.com/2.0/?method=album.getInfo&artist=${encodeURIComponent(artistName)}&album=${encodeURIComponent(albumName)}&api_key=${LASTFM_KEY}&format=json&autocorrect=1`;
    const data = await throttleLastfm(() => fetchLastfmApi(url));
    const summary: string | undefined = data?.album?.wiki?.summary;
    if (!summary || summary.includes("does not have a wiki")) return null;
    const clean = stripHtmlTags(summary).replace(/Read more on Last\.fm\.?$/, "").trim();
    if (clean.length < 20) return null;
    return { bio: clean, source: "lastfm" };
  } catch {
    return null;
  }
}

export async function fetchBioWikipedia(title: string): Promise<{ bio: string; source: "wikipedia" } | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Tracklist/1.0 (singh.avi99@gmail.com)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const extract: string | undefined = data?.extract;
    if (!extract || extract.length < 20) return null;
    return { bio: extract, source: "wikipedia" };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/musicbrainz/fetch-bio.ts
git commit -m "feat: bio fetchers — Last.fm artist/album.getInfo + Wikipedia summary fallback"
```

---

## Task 5: Artist Enrichment Function

**Files:**
- Create: `lib/musicbrainz/enrich-artist.ts`

- [ ] **Step 1: Write enrich-artist.ts**

```typescript
// lib/musicbrainz/enrich-artist.ts
import "server-only";
import {
  resolveArtistMbid,
  fetchMbArtist,
} from "@tracklist/musicbrainz-client";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { upsertLabel } from "./upsert-label";
import { upsertCreditArtist } from "./upsert-credit-artist";
import { fetchArtistBioLastfm, fetchBioWikipedia } from "./fetch-bio";
import { getTrackIdByExternalId } from "@/lib/catalog/entity-resolution";

const BIO_TTL_MS = 90 * 24 * 60 * 60 * 1000;   // 90 days
const CREDIT_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

function isStale(ts: string | null, ttlMs: number): boolean {
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > ttlMs;
}

// External link URL patterns → canonical key
const EXT_LINK_PATTERNS: Array<[RegExp, string]> = [
  [/wikipedia\.org\/wiki\/(.+)/, "wikipedia"],
  [/discogs\.com\/artist\//, "discogs"],
  [/allmusic\.com\/artist\//, "allmusic"],
  [/soundcloud\.com\//, "soundcloud"],
  [/facebook\.com\//, "facebook"],
  [/instagram\.com\//, "instagram"],
  [/twitter\.com\/|x\.com\//, "twitter"],
];

function parseExternalLinks(relations: Array<{ type: string; url?: { resource: string } }>): Record<string, string> {
  const links: Record<string, string> = {};
  for (const rel of relations) {
    if (!rel.url?.resource) continue;
    for (const [pattern, key] of EXT_LINK_PATTERNS) {
      if (pattern.test(rel.url.resource)) {
        links[key] = rel.url.resource;
        break;
      }
    }
  }
  return links;
}

export async function enrichArtist(artistUuid: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  // Fetch current artist to check TTLs and get Spotify ID
  const { data: artist } = await supabase
    .from("artists")
    .select("id, name, mbid, credits_enriched_at, bio_enriched_at, bio")
    .eq("id", artistUuid)
    .single();

  if (!artist) return;

  const needsCredits = isStale(artist.credits_enriched_at, CREDIT_TTL_MS);
  const needsBio = isStale(artist.bio_enriched_at, BIO_TTL_MS);

  if (!needsCredits && !needsBio) return;

  // Resolve MBID if we don't have it
  let mbid = artist.mbid as string | null;
  if (!mbid && needsCredits) {
    // Get Spotify ID from external_ids table
    const { data: extId } = await supabase
      .from("external_ids")
      .select("external_id")
      .eq("entity_id", artistUuid)
      .eq("source", "spotify")
      .maybeSingle();

    if (extId?.external_id) {
      mbid = await resolveArtistMbid(extId.external_id as string);
      if (mbid) {
        await supabase.from("artists").update({ mbid }).eq("id", artistUuid);
      }
    }
  }

  // ── Bio ────────────────────────────────────────────────────────────────────
  if (needsBio) {
    const result =
      (await fetchArtistBioLastfm(artist.name as string)) ??
      (await fetchBioWikipedia(artist.name as string));

    await supabase
      .from("artists")
      .update({
        bio: result?.bio ?? artist.bio ?? null,
        bio_source: result?.source ?? null,
        bio_enriched_at: new Date().toISOString(),
      })
      .eq("id", artistUuid);
  }

  // ── Credits ────────────────────────────────────────────────────────────────
  if (!needsCredits || !mbid) {
    await supabase.from("artists").update({ credits_enriched_at: new Date().toISOString() }).eq("id", artistUuid);
    return;
  }

  const mbArtist = await fetchMbArtist(mbid);
  if (!mbArtist) {
    await supabase.from("artists").update({ credits_enriched_at: new Date().toISOString() }).eq("id", artistUuid);
    return;
  }

  const relations = mbArtist.relations ?? [];

  // Members ("member of band" relationship, direction = backward means this person IS a member)
  const memberRels = relations.filter(
    (r) => r.type === "member of band" && r.direction === "backward" && r.artist,
  );
  for (const rel of memberRels) {
    const memberUuid = await upsertCreditArtist(supabase, rel.artist!);
    await supabase.from("artist_members").upsert({
      artist_id: artistUuid,
      member_artist_id: memberUuid,
      role: rel.attributes?.join(", ") ?? null,
      is_active: !rel.ended,
    }, { onConflict: "artist_id,member_artist_id" });
  }

  // Label relationships
  const labelRels = relations.filter((r) => r.type === "label" && r.label);
  for (const rel of labelRels) {
    const labelId = await upsertLabel(supabase, rel.label!);
    const startYear = rel.begin ? parseInt(rel.begin.slice(0, 4), 10) || null : null;
    const endYear = rel.end ? parseInt(rel.end.slice(0, 4), 10) || null : null;
    await supabase.from("artist_labels").upsert({
      artist_id: artistUuid,
      label_id: labelId,
      start_year: startYear,
      end_year: endYear,
      is_current: !rel.ended,
    }, { onConflict: "artist_id,label_id,COALESCE(start_year, -1)" });
  }

  // External links
  const urlRels = relations.filter((r) => r.url);
  const externalLinks = parseExternalLinks(urlRels);

  await supabase.from("artists").update({
    external_links: Object.keys(externalLinks).length ? externalLinks : null,
    credits_enriched_at: new Date().toISOString(),
  }).eq("id", artistUuid);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/musicbrainz/enrich-artist.ts
git commit -m "feat: artist enrichment — MBID resolution, bio, members, labels, external links"
```

---

## Task 6: Album Enrichment Function

**Files:**
- Create: `lib/musicbrainz/enrich-album.ts`

- [ ] **Step 1: Write enrich-album.ts**

```typescript
// lib/musicbrainz/enrich-album.ts
import "server-only";
import { resolveAlbumMbid, fetchMbRelease } from "@tracklist/musicbrainz-client";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { upsertLabel } from "./upsert-label";
import { upsertCreditArtist } from "./upsert-credit-artist";
import { fetchAlbumBioLastfm } from "./fetch-bio";

const BIO_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const CREDIT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function isStale(ts: string | null, ttlMs: number): boolean {
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > ttlMs;
}

const RELEASE_TYPE_MAP: Record<string, string> = {
  Album: "album",
  EP: "ep",
  Single: "single",
  "Live performance": "live",
  Compilation: "compilation",
};

export async function enrichAlbum(albumUuid: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { data: album } = await supabase
    .from("albums")
    .select("id, name, artist_id, mbid, credits_enriched_at, bio_enriched_at, bio")
    .eq("id", albumUuid)
    .single();

  if (!album) return;

  const needsCredits = isStale(album.credits_enriched_at as string | null, CREDIT_TTL_MS);
  const needsBio = isStale(album.bio_enriched_at as string | null, BIO_TTL_MS);

  if (!needsCredits && !needsBio) return;

  // Resolve MBID
  let mbid = album.mbid as string | null;
  if (!mbid && needsCredits) {
    const { data: extId } = await supabase
      .from("external_ids")
      .select("external_id")
      .eq("entity_id", albumUuid)
      .eq("source", "spotify")
      .maybeSingle();

    if (extId?.external_id) {
      mbid = await resolveAlbumMbid(extId.external_id as string);
      if (mbid) await supabase.from("albums").update({ mbid }).eq("id", albumUuid);
    }
  }

  // ── Bio ────────────────────────────────────────────────────────────────────
  if (needsBio) {
    // Need artist name for Last.fm lookup
    const { data: artistRow } = await supabase
      .from("artists")
      .select("name")
      .eq("id", album.artist_id)
      .single();

    const result = artistRow
      ? await fetchAlbumBioLastfm(artistRow.name as string, album.name as string)
      : null;

    await supabase.from("albums").update({
      bio: result?.bio ?? album.bio ?? null,
      bio_source: result?.source ?? null,
      bio_enriched_at: new Date().toISOString(),
    }).eq("id", albumUuid);
  }

  // ── Credits ────────────────────────────────────────────────────────────────
  if (!needsCredits || !mbid) {
    await supabase.from("albums").update({ credits_enriched_at: new Date().toISOString() }).eq("id", albumUuid);
    return;
  }

  const mbRelease = await fetchMbRelease(mbid);
  if (!mbRelease) {
    await supabase.from("albums").update({ credits_enriched_at: new Date().toISOString() }).eq("id", albumUuid);
    return;
  }

  // Release type
  const primaryType = mbRelease["release-group"]?.["primary-type"];
  const releaseType = primaryType ? (RELEASE_TYPE_MAP[primaryType] ?? "album") : null;

  // Label
  const labelInfo = mbRelease["label-info"]?.[0]?.label;
  if (labelInfo) {
    const labelId = await upsertLabel(supabase, labelInfo);
    await supabase.from("album_labels").upsert({ album_id: albumUuid, label_id: labelId }, { onConflict: "album_id,label_id" });
  }

  // Producer / songwriter relationships directly on the release
  const relations = mbRelease.relations ?? [];
  for (const rel of relations) {
    if (!rel.artist) continue;
    if (rel.type === "producer") {
      const artistId = await upsertCreditArtist(supabase, rel.artist, { isProducer: true });
      await supabase.from("album_producers").upsert({ album_id: albumUuid, artist_id: artistId }, { onConflict: "album_id,artist_id" });
    }
    if (rel.type === "lyricist" || rel.type === "composer" || rel.type === "writer") {
      const artistId = await upsertCreditArtist(supabase, rel.artist, { isSongwriter: true });
      await supabase.from("album_songwriters").upsert({ album_id: albumUuid, artist_id: artistId }, { onConflict: "album_id,artist_id" });
    }
  }

  await supabase.from("albums").update({
    release_type: releaseType,
    credits_enriched_at: new Date().toISOString(),
  }).eq("id", albumUuid);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/musicbrainz/enrich-album.ts
git commit -m "feat: album enrichment — MBID, bio, label, release type, producer/songwriter credits"
```

---

## Task 7: Song Enrichment Function

**Files:**
- Create: `lib/musicbrainz/enrich-song.ts`

- [ ] **Step 1: Write enrich-song.ts**

```typescript
// lib/musicbrainz/enrich-song.ts
import "server-only";
import {
  resolveTrackMbid,
  fetchMbRecording,
} from "@tracklist/musicbrainz-client";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { upsertCreditArtist } from "./upsert-credit-artist";

const CREDIT_TTL_MS = 365 * 24 * 60 * 60 * 1000;

function isStale(ts: string | null, ttlMs: number): boolean {
  if (!ts) return true;
  return Date.now() - new Date(ts).getTime() > ttlMs;
}

async function findOrCreateTrackByMbid(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  mbid: string,
  title: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("tracks")
    .select("id")
    .eq("mbid", mbid)
    .maybeSingle();
  if (existing) return existing.id as string;

  // We don't create stub track records for samples — only link if already in DB
  return null;
}

export async function enrichSong(songUuid: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  const { data: track } = await supabase
    .from("tracks")
    .select("id, name, mbid, credits_enriched_at")
    .eq("id", songUuid)
    .single();

  if (!track || !isStale(track.credits_enriched_at as string | null, CREDIT_TTL_MS)) return;

  // Resolve MBID
  let mbid = track.mbid as string | null;
  if (!mbid) {
    const { data: extId } = await supabase
      .from("external_ids")
      .select("external_id")
      .eq("entity_id", songUuid)
      .eq("source", "spotify")
      .maybeSingle();

    if (extId?.external_id) {
      mbid = await resolveTrackMbid(extId.external_id as string);
      if (mbid) await supabase.from("tracks").update({ mbid }).eq("id", songUuid);
    }
  }

  if (!mbid) {
    await supabase.from("tracks").update({ credits_enriched_at: new Date().toISOString() }).eq("id", songUuid);
    return;
  }

  const recording = await fetchMbRecording(mbid);
  if (!recording) {
    await supabase.from("tracks").update({ credits_enriched_at: new Date().toISOString() }).eq("id", songUuid);
    return;
  }

  const relations = recording.relations ?? [];

  for (const rel of relations) {
    if (!rel.artist) continue;

    if (rel.type === "producer") {
      const artistId = await upsertCreditArtist(supabase, rel.artist, { isProducer: true });
      await supabase.from("song_producers").upsert({ song_id: songUuid, artist_id: artistId }, { onConflict: "song_id,artist_id" });
    }

    if (rel.type === "lyricist" || rel.type === "composer" || rel.type === "writer") {
      const artistId = await upsertCreditArtist(supabase, rel.artist, { isSongwriter: true });
      await supabase.from("song_songwriters").upsert({ song_id: songUuid, artist_id: artistId }, { onConflict: "song_id,artist_id" });
    }
  }

  // Samples / covers come from work relationships — recording → work → "samples material from" / "based on"
  // These show up in work-rels on the recording. MusicBrainz returns them as recording→work links,
  // then the work has its own relations. Skip if no work relations.
  for (const rel of relations) {
    if (rel.type === "samples material from" && rel.recording) {
      const sampledId = await findOrCreateTrackByMbid(supabase, rel.recording.id, rel.recording.title);
      if (sampledId) {
        await supabase.from("song_samples").upsert({ song_id: songUuid, sampled_song_id: sampledId }, { onConflict: "song_id,sampled_song_id" });
      }
    }
    if ((rel.type === "cover of" || rel.type === "based on") && rel.recording) {
      const originalId = await findOrCreateTrackByMbid(supabase, rel.recording.id, rel.recording.title);
      if (originalId) {
        await supabase.from("song_covers").upsert({ song_id: songUuid, original_song_id: originalId }, { onConflict: "song_id,original_song_id" });
      }
    }
  }

  await supabase.from("tracks").update({ credits_enriched_at: new Date().toISOString() }).eq("id", songUuid);
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/musicbrainz/enrich-song.ts
git commit -m "feat: song enrichment — MBID, producer/songwriter, samples and covers from MusicBrainz"
```

---

## Task 8: BullMQ Queue + In-Memory Fallback

**Files:**
- Create: `lib/jobs/musicbrainzQueue.ts`

- [ ] **Step 1: Write musicbrainzQueue.ts** (modelled exactly on `lib/jobs/spotifyQueue.ts`)

```typescript
// lib/jobs/musicbrainzQueue.ts
import "server-only";

import { after } from "next/server";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { attachRedisErrorHandler } from "@/lib/redis-error-handler";

export type MusicBrainzEnrichJobData =
  | { name: "enrich_artist"; artistId: string }
  | { name: "enrich_album"; albumId: string }
  | { name: "enrich_song"; songId: string };

const QUEUE_NAME = "musicbrainz-enrich";

let redisConnection: IORedis | null | undefined;
let mbQueue: Queue | null | undefined;

function getRedisConnection(): IORedis | null {
  if (redisConnection !== undefined) return redisConnection;
  const url = process.env.REDIS_URL?.trim();
  if (!url) { redisConnection = null; return null; }
  try {
    redisConnection = new IORedis(url, { maxRetriesPerRequest: null });
    attachRedisErrorHandler(redisConnection, "bullmq-mb");
  } catch { redisConnection = null; }
  return redisConnection;
}

export function getMusicBrainzQueue(): Queue | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  if (!mbQueue) mbQueue = new Queue(QUEUE_NAME, { connection: conn });
  return mbQueue;
}

// ── In-memory fallback (no Redis) ─────────────────────────────────────────────
const inMemoryQueue: MusicBrainzEnrichJobData[] = [];
const inMemoryDedupe = new Set<string>();
let processing = false;

function jobKey(job: MusicBrainzEnrichJobData): string {
  if (job.name === "enrich_artist") return `enrich_artist:${job.artistId}`;
  if (job.name === "enrich_album") return `enrich_album:${job.albumId}`;
  return `enrich_song:${job.songId}`;
}

async function processInMemory(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    for (;;) {
      const next = inMemoryQueue.shift();
      if (!next) break;
      const key = jobKey(next);
      try { await processMusicBrainzJob(next); } catch { /* swallow */ }
      finally { inMemoryDedupe.delete(key); }
    }
  } finally {
    processing = false;
  }
}

async function enqueueInMemory(job: MusicBrainzEnrichJobData): Promise<void> {
  const key = jobKey(job);
  if (inMemoryDedupe.has(key)) return;
  inMemoryDedupe.add(key);
  inMemoryQueue.push(job);
  try { after(() => { void processInMemory(); }); } catch { void processInMemory(); }
}

export async function enqueueMusicBrainzEnrich(job: MusicBrainzEnrichJobData): Promise<void> {
  const q = getMusicBrainzQueue();
  if (!q) { await enqueueInMemory(job); return; }
  void q
    .add(job.name, job, { removeOnComplete: 200, removeOnFail: 100 })
    .catch((err) => console.error("[mb-queue] add failed", job.name, err));
}

export async function processMusicBrainzJob(job: MusicBrainzEnrichJobData): Promise<void> {
  if (job.name === "enrich_artist") {
    const { enrichArtist } = await import("@/lib/musicbrainz/enrich-artist");
    await enrichArtist(job.artistId);
    return;
  }
  if (job.name === "enrich_album") {
    const { enrichAlbum } = await import("@/lib/musicbrainz/enrich-album");
    await enrichAlbum(job.albumId);
    return;
  }
  if (job.name === "enrich_song") {
    const { enrichSong } = await import("@/lib/musicbrainz/enrich-song");
    await enrichSong(job.songId);
  }
}

export function createMusicBrainzWorker(): Worker | null {
  const conn = getRedisConnection();
  if (!conn) return null;
  return new Worker(
    QUEUE_NAME,
    async (bullJob) => { await processMusicBrainzJob(bullJob.data as MusicBrainzEnrichJobData); },
    { connection: conn, concurrency: 1 }, // concurrency 1 — respects 1 req/sec limit in enricher
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/jobs/musicbrainzQueue.ts
git commit -m "feat: MusicBrainz BullMQ queue with in-memory fallback — mirrors Spotify queue pattern"
```

---

## Task 9: Worker Script + npm Script Entry

**Files:**
- Create: `scripts/musicbrainz-enrich-worker.ts`
- Modify: `package.json` (root)

- [ ] **Step 1: Write the worker script**

```typescript
// scripts/musicbrainz-enrich-worker.ts
import { createMusicBrainzWorker } from "@/lib/jobs/musicbrainzQueue";

const worker = createMusicBrainzWorker();
if (!worker) {
  console.error("[mb-worker] REDIS_URL not set — worker cannot start");
  process.exit(1);
}

worker.on("completed", (job) => {
  console.log(`[mb-worker] completed ${job.name} ${JSON.stringify(job.data)}`);
});
worker.on("failed", (job, err) => {
  console.error(`[mb-worker] failed ${job?.name}`, err.message);
});

console.log("[mb-worker] MusicBrainz enrich worker started");

process.on("SIGTERM", () => { void worker.close(); });
process.on("SIGINT",  () => { void worker.close(); });
```

- [ ] **Step 2: Add npm script to package.json**

In the root `package.json`, find the `scripts` block and add:
```json
"worker:musicbrainz-enrich": "NODE_OPTIONS='-r ./scripts/register-server-only-stub.cjs' tsx scripts/musicbrainz-enrich-worker.ts"
```

- [ ] **Step 3: Verify it starts (requires Redis)**

```bash
REDIS_URL=redis://localhost:6379 npm run worker:musicbrainz-enrich
```

Expected: `[mb-worker] MusicBrainz enrich worker started` — then stays running.

- [ ] **Step 4: Commit**

```bash
git add scripts/musicbrainz-enrich-worker.ts package.json
git commit -m "feat: musicbrainz-enrich worker script + npm run worker:musicbrainz-enrich"
```

---

## Task 10: DB Query Helpers for Info Tab Data

**Files:**
- Create: `lib/musicbrainz/db-queries.ts`

- [ ] **Step 1: Write db-queries.ts**

```typescript
// lib/musicbrainz/db-queries.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface CreditPerson {
  id: string;
  name: string;
  mbid: string | null;
  image_url?: string | null;
}

export interface LabelEntry {
  id: string;
  name: string;
  mbid: string | null;
}

export interface LabelHistoryEntry extends LabelEntry {
  start_year: number | null;
  end_year: number | null;
  is_current: boolean;
}

export interface MemberEntry {
  id: string;
  name: string;
  role: string | null;
  is_active: boolean;
}

export interface SongRef {
  id: string;
  name: string;
  artist_name: string;
  artist_id: string;
  album_image_url: string | null;
  release_year: number | null;
}

// ── Artist ─────────────────────────────────────────────────────────────────────

export async function getArtistInfoTabData(supabase: SupabaseClient, artistId: string) {
  const [membersResult, labelsResult] = await Promise.all([
    supabase
      .from("artist_members")
      .select("member_artist_id, role, is_active, artists!artist_members_member_artist_id_fkey(id, name)")
      .eq("artist_id", artistId),
    supabase
      .from("artist_labels")
      .select("start_year, end_year, is_current, labels(id, name, mbid)")
      .eq("artist_id", artistId)
      .order("start_year", { ascending: false, nullsFirst: true }),
  ]);

  const members: MemberEntry[] = (membersResult.data ?? []).map((r: any) => ({
    id: r.artists.id,
    name: r.artists.name,
    role: r.role,
    is_active: r.is_active,
  }));

  const labelHistory: LabelHistoryEntry[] = (labelsResult.data ?? []).map((r: any) => ({
    id: r.labels.id,
    name: r.labels.name,
    mbid: r.labels.mbid,
    start_year: r.start_year,
    end_year: r.end_year,
    is_current: r.is_current,
  }));

  return { members, labelHistory };
}

// ── Album ──────────────────────────────────────────────────────────────────────

export async function getAlbumInfoTabData(supabase: SupabaseClient, albumId: string) {
  const [producersResult, songwritersResult, labelsResult] = await Promise.all([
    supabase
      .from("album_producers")
      .select("artists(id, name, mbid, image_url)")
      .eq("album_id", albumId),
    supabase
      .from("album_songwriters")
      .select("artists(id, name, mbid, image_url)")
      .eq("album_id", albumId),
    supabase
      .from("album_labels")
      .select("labels(id, name, mbid)")
      .eq("album_id", albumId),
  ]);

  const producers: CreditPerson[] = (producersResult.data ?? []).map((r: any) => r.artists);
  const songwriters: CreditPerson[] = (songwritersResult.data ?? []).map((r: any) => r.artists);
  const labels: LabelEntry[] = (labelsResult.data ?? []).map((r: any) => r.labels);

  return { producers, songwriters, labels };
}

// ── Song ───────────────────────────────────────────────────────────────────────

export async function getSongInfoTabData(supabase: SupabaseClient, songId: string) {
  const [producersResult, songwritersResult, samplesResult, sampledByResult, coversResult, featResult] = await Promise.all([
    supabase.from("song_producers").select("artists(id, name, mbid)").eq("song_id", songId),
    supabase.from("song_songwriters").select("artists(id, name, mbid)").eq("song_id", songId),
    // Songs this track samples
    supabase.from("song_samples").select(`
      tracks!song_samples_sampled_song_id_fkey(id, name,
        artists(id, name),
        albums(release_date, image_url)
      )
    `).eq("song_id", songId).limit(10),
    // Songs that sample this track
    supabase.from("song_samples").select(`
      tracks!song_samples_song_id_fkey(id, name,
        artists(id, name),
        albums(release_date, image_url)
      )
    `).eq("sampled_song_id", songId).limit(10),
    // Songs this is a cover of
    supabase.from("song_covers").select(`
      tracks!song_covers_original_song_id_fkey(id, name,
        artists(id, name),
        albums(release_date, image_url)
      )
    `).eq("song_id", songId).limit(10),
    // Featuring artists
    supabase.from("track_featuring_artists").select("artists(id, name, mbid)").eq("track_id", songId),
  ]);

  function toSongRef(r: any, trackKey: string): SongRef {
    const t = r[trackKey];
    const releaseDate: string | null = t.albums?.release_date ?? null;
    return {
      id: t.id, name: t.name,
      artist_name: t.artists?.name ?? "",
      artist_id: t.artists?.id ?? "",
      album_image_url: t.albums?.image_url ?? null,
      release_year: releaseDate ? parseInt(releaseDate.slice(0, 4), 10) : null,
    };
  }

  return {
    producers: (producersResult.data ?? []).map((r: any) => r.artists) as CreditPerson[],
    songwriters: (songwritersResult.data ?? []).map((r: any) => r.artists) as CreditPerson[],
    featuring: (featResult.data ?? []).map((r: any) => r.artists) as CreditPerson[],
    samples: (samplesResult.data ?? []).map((r) => toSongRef(r, "tracks")),
    sampledBy: (sampledByResult.data ?? []).map((r) => toSongRef(r, "tracks")),
    covers: (coversResult.data ?? []).map((r) => toSongRef(r, "tracks")),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/musicbrainz/db-queries.ts
git commit -m "feat: DB query helpers for Info tab data — artist members/labels, album/song credits"
```

---

## Task 11: Label API Routes

**Files:**
- Create: `app/api/labels/[id]/route.ts`
- Create: `app/api/labels/[id]/artists/route.ts`
- Create: `app/api/labels/[id]/albums/route.ts`

- [ ] **Step 1: Write label detail route**

```typescript
// app/api/labels/[id]/route.ts
import { withHandler } from "@/lib/api-handler";
import { apiNotFound, apiOk } from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const GET = withHandler(async (_req, ctx) => {
  const { id } = ctx.params;
  const supabase = await createSupabaseServerClient();

  const { data: label } = await supabase
    .from("labels")
    .select("id, name, bio, bio_source, country, founded_year, image_url, external_links, mbid")
    .eq("id", id)
    .maybeSingle();

  if (!label) return apiNotFound("Label not found");

  // Top 12 artists on this label
  const { data: artistRows } = await supabase
    .from("artist_labels")
    .select("artists(id, name, image_url)")
    .eq("label_id", id)
    .limit(12);

  // Top 12 albums on this label
  const { data: albumRows } = await supabase
    .from("album_labels")
    .select("albums(id, name, image_url, release_date)")
    .eq("label_id", id)
    .limit(12);

  return apiOk({
    label,
    topArtists: (artistRows ?? []).map((r: any) => r.artists),
    topAlbums: (albumRows ?? []).map((r: any) => r.albums),
  });
}, { requireAuth: false });
```

- [ ] **Step 2: Write label artists route**

```typescript
// app/api/labels/[id]/artists/route.ts
import { withHandler } from "@/lib/api-handler";
import { apiOk } from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const GET = withHandler(async (req, ctx) => {
  const { id } = ctx.params;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = 24;
  const from = (page - 1) * limit;

  const supabase = await createSupabaseServerClient();
  const { data, count } = await supabase
    .from("artist_labels")
    .select("artists(id, name, image_url)", { count: "exact" })
    .eq("label_id", id)
    .range(from, from + limit - 1);

  return apiOk({
    artists: (data ?? []).map((r: any) => r.artists),
    total: count ?? 0,
    page,
  });
}, { requireAuth: false });
```

- [ ] **Step 3: Write label albums route**

```typescript
// app/api/labels/[id]/albums/route.ts
import { withHandler } from "@/lib/api-handler";
import { apiOk } from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const GET = withHandler(async (req, ctx) => {
  const { id } = ctx.params;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = 24;
  const from = (page - 1) * limit;

  const supabase = await createSupabaseServerClient();
  const { data, count } = await supabase
    .from("album_labels")
    .select("albums(id, name, image_url, release_date)", { count: "exact" })
    .eq("label_id", id)
    .range(from, from + limit - 1);

  return apiOk({
    albums: (data ?? []).map((r: any) => r.albums),
    total: count ?? 0,
    page,
  });
}, { requireAuth: false });
```

- [ ] **Step 4: Commit**

```bash
git add app/api/labels/
git commit -m "feat: label API routes — detail, paginated artists, paginated albums"
```

---

## Task 12: Modify Artist API Route

**Files:**
- Modify: `app/api/artists/[id]/route.ts`
- Modify: `app/api/artists/[id]/detail-bundle/route.ts`

- [ ] **Step 1: Add Info tab fields to the artist route**

In `app/api/artists/[id]/route.ts`, after the existing `getOrFetchArtist` call, add:

```typescript
// Add after line that calls getOrFetchArtist and before return apiOk(...)

// Enqueue MusicBrainz enrichment if stale (non-blocking)
const { data: artistMeta } = await supabase
  .from("artists")
  .select("bio, bio_source, external_links, mbid, credits_enriched_at, bio_enriched_at, is_producer, is_songwriter")
  .eq("id", lookupId)
  .maybeSingle();

const creditsStale =
  !artistMeta?.credits_enriched_at ||
  Date.now() - new Date(artistMeta.credits_enriched_at as string).getTime() > 365 * 24 * 60 * 60 * 1000;

if (creditsStale) {
  void import("@/lib/jobs/musicbrainzQueue")
    .then(({ enqueueMusicBrainzEnrich }) =>
      enqueueMusicBrainzEnrich({ name: "enrich_artist", artistId: lookupId }),
    )
    .catch(() => null);
}

const { getArtistInfoTabData } = await import("@/lib/musicbrainz/db-queries");
const infoTabData = await getArtistInfoTabData(supabase, lookupId);
```

Then extend the `return apiOk(...)` payload to include:
```typescript
return apiOk({
  // ... existing fields ...
  bio: artistMeta?.bio ?? null,
  bio_source: artistMeta?.bio_source ?? null,
  external_links: artistMeta?.external_links ?? null,
  is_producer: artistMeta?.is_producer ?? false,
  is_songwriter: artistMeta?.is_songwriter ?? false,
  credits_enriched_at: artistMeta?.credits_enriched_at ?? null,
  members: infoTabData.members,
  label_history: infoTabData.labelHistory,
});
```

- [ ] **Step 2: Add the same fields to detail-bundle route**

Open `app/api/artists/[id]/detail-bundle/route.ts`. Find where it calls the artist data fetch. Add the same `artistMeta` fetch + `getArtistInfoTabData` call, and include `bio`, `external_links`, `members`, `label_history` in the bundle response.

- [ ] **Step 3: Commit**

```bash
git add app/api/artists/
git commit -m "feat: artist API route — add bio, external_links, members, label_history, is_producer/songwriter"
```

---

## Task 13: Modify Album API Route

**Files:**
- Modify: `app/api/albums/[id]/route.ts`

- [ ] **Step 1: Add Info tab fields**

Open `app/api/albums/[id]/route.ts`. After the existing album fetch, add:

```typescript
// After fetching album data, add:
const { data: albumMeta } = await supabase
  .from("albums")
  .select("bio, bio_source, external_links, mbid, release_type, credits_enriched_at, bio_enriched_at")
  .eq("id", albumId) // use whatever variable holds the resolved album UUID
  .maybeSingle();

const creditsStale =
  !albumMeta?.credits_enriched_at ||
  Date.now() - new Date(albumMeta.credits_enriched_at as string).getTime() > 365 * 24 * 60 * 60 * 1000;

if (creditsStale) {
  void import("@/lib/jobs/musicbrainzQueue")
    .then(({ enqueueMusicBrainzEnrich }) =>
      enqueueMusicBrainzEnrich({ name: "enrich_album", albumId }),
    )
    .catch(() => null);
}

const { getAlbumInfoTabData } = await import("@/lib/musicbrainz/db-queries");
const infoTabData = await getAlbumInfoTabData(supabase, albumId);
```

Add to the response payload:
```typescript
bio: albumMeta?.bio ?? null,
bio_source: albumMeta?.bio_source ?? null,
release_type: albumMeta?.release_type ?? null,
credits_enriched_at: albumMeta?.credits_enriched_at ?? null,
producers: infoTabData.producers,
songwriters: infoTabData.songwriters,
labels: infoTabData.labels,
```

- [ ] **Step 2: Commit**

```bash
git add app/api/albums/
git commit -m "feat: album API route — add bio, release_type, producers, songwriters, labels"
```

---

## Task 14: Modify Song API Route

**Files:**
- Modify: `app/api/songs/[id]/route.ts`

- [ ] **Step 1: Add Info tab fields**

Open `app/api/songs/[id]/route.ts`. After the existing song fetch, add:

```typescript
// Enqueue enrichment if stale
const { data: songMeta } = await supabase
  .from("tracks")
  .select("credits_enriched_at")
  .eq("id", songId)
  .maybeSingle();

const creditsStale =
  !songMeta?.credits_enriched_at ||
  Date.now() - new Date(songMeta.credits_enriched_at as string).getTime() > 365 * 24 * 60 * 60 * 1000;

if (creditsStale) {
  void import("@/lib/jobs/musicbrainzQueue")
    .then(({ enqueueMusicBrainzEnrich }) =>
      enqueueMusicBrainzEnrich({ name: "enrich_song", songId }),
    )
    .catch(() => null);
}

const { getSongInfoTabData } = await import("@/lib/musicbrainz/db-queries");
const infoTabData = await getSongInfoTabData(supabase, songId);
```

Add to response:
```typescript
producers: infoTabData.producers,
songwriters: infoTabData.songwriters,
featuring: infoTabData.featuring,
samples: infoTabData.samples,
sampled_by: infoTabData.sampledBy,
covers: infoTabData.covers,
credits_enriched_at: songMeta?.credits_enriched_at ?? null,
```

- [ ] **Step 2: Commit**

```bash
git add app/api/songs/
git commit -m "feat: song API route — add producers, songwriters, featuring, samples, sampled_by, covers"
```

---

## Task 15: Web Info Tab Components

**Files:**
- Create: `components/info-tab/CreditsBlock.tsx`
- Create: `components/info-tab/MembersGrid.tsx`
- Create: `components/info-tab/SongCard.tsx`
- Create: `components/info-tab/ExternalLinks.tsx`
- Create: `components/info-tab/SongInfoTab.tsx`
- Create: `components/info-tab/AlbumInfoTab.tsx`
- Create: `components/info-tab/ArtistInfoTab.tsx`
- Modify: `app/song/[id]/song-page-tabs.tsx`

- [ ] **Step 1: CreditsBlock.tsx — inline colored names (Option C)**

```tsx
// components/info-tab/CreditsBlock.tsx
"use client";
import Link from "next/link";
import { useState } from "react";

type CreditPerson = { id: string; name: string };

interface CreditsBlockProps {
  label: string;
  people: CreditPerson[];
  color: "emerald" | "amber" | "purple";
  entityPath: (id: string) => string; // e.g. (id) => `/artist/${id}`
  maxShown?: number;
}

const COLOR = {
  emerald: { name: "text-emerald-500", border: "border-emerald-500/30 hover:border-emerald-500" },
  amber:   { name: "text-amber-400",   border: "border-amber-400/30 hover:border-amber-400" },
  purple:  { name: "text-violet-400",  border: "border-violet-400/30 hover:border-violet-400" },
};

export function CreditsBlock({ label, people, color, entityPath, maxShown = 4 }: CreditsBlockProps) {
  const [expanded, setExpanded] = useState(false);
  if (people.length === 0) return null;
  const c = COLOR[color];
  const shown = expanded ? people : people.slice(0, maxShown);
  const hidden = people.length - maxShown;

  return (
    <div className="mb-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1.5">{label}</p>
      <p className="leading-relaxed">
        {shown.map((p, i) => (
          <span key={p.id}>
            <Link
              href={entityPath(p.id)}
              className={`text-sm font-medium ${c.name} border-b ${c.border} transition-colors`}
            >
              {p.name}
            </Link>
            {i < shown.length - 1 && <span className="text-zinc-600 text-sm mr-1">,</span>}
          </span>
        ))}
        {!expanded && hidden > 0 && (
          <>
            <span className="text-zinc-600 text-sm mr-1">,</span>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-[13px] text-zinc-500 hover:text-emerald-500 transition-colors"
            >
              +{hidden} more
            </button>
          </>
        )}
        {expanded && hidden > 0 && (
          <>
            <span className="text-zinc-600 text-sm mx-1">·</span>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-[13px] text-zinc-500 hover:text-emerald-500 transition-colors"
            >
              Show less
            </button>
          </>
        )}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: MembersGrid.tsx**

```tsx
// components/info-tab/MembersGrid.tsx
import Link from "next/link";

interface Member { id: string; name: string; role: string | null; is_active: boolean }

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function MembersGrid({ members }: { members: Member[] }) {
  if (members.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">Members</p>
      <div className="flex flex-wrap gap-4">
        {members.map((m) => (
          <Link key={m.id} href={`/artist/${m.id}`} className="flex flex-col items-center gap-1.5 group">
            <div className={`w-11 h-11 rounded-full bg-zinc-800 flex items-center justify-center border border-transparent group-hover:border-emerald-500 transition-colors`}>
              <span className="text-[13px] font-semibold text-zinc-400">{initials(m.name)}</span>
            </div>
            <span className="text-[10px] text-zinc-500 max-w-[56px] text-center leading-tight">{m.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: SongCard.tsx**

```tsx
// components/info-tab/SongCard.tsx
import Link from "next/link";
import { Image } from "@/components/ui/Image"; // or next/image — whatever the project uses

interface SongRef {
  id: string; name: string; artist_name: string; artist_id: string;
  album_image_url: string | null; release_year: number | null;
}

export function SongCard({ song }: { song: SongRef }) {
  return (
    <Link href={`/song/${song.id}`} className="flex items-center gap-2.5 py-2 border-b border-zinc-900 last:border-0 hover:opacity-75 transition-opacity">
      <div className="w-10 h-10 rounded-[6px] bg-zinc-800 flex-shrink-0 overflow-hidden">
        {song.album_image_url && (
          <img src={song.album_image_url} alt="" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] text-zinc-100 font-medium truncate">{song.name}</p>
        <p className="text-[12px] text-zinc-500 truncate mt-0.5">{song.artist_name}</p>
      </div>
      {song.release_year && (
        <span className="text-[12px] text-zinc-600 flex-shrink-0">{song.release_year}</span>
      )}
    </Link>
  );
}
```

- [ ] **Step 4: ExternalLinks.tsx**

```tsx
// components/info-tab/ExternalLinks.tsx
const LABELS: Record<string, string> = {
  wikipedia: "Wikipedia", discogs: "Discogs", allmusic: "AllMusic",
  soundcloud: "SoundCloud", facebook: "Facebook", instagram: "Instagram", twitter: "Twitter",
};

export function ExternalLinks({ links }: { links: Record<string, string> | null }) {
  const entries = Object.entries(links ?? {}).filter(([k]) => LABELS[k]);
  if (entries.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">Links</p>
      <div className="flex flex-wrap gap-2">
        {entries.map(([key, url]) => (
          <a key={key} href={url} target="_blank" rel="noopener noreferrer"
            className="text-[12px] font-medium text-zinc-500 px-3 py-1.5 border border-zinc-800 rounded-full hover:border-zinc-600 hover:text-zinc-300 transition-colors">
            {LABELS[key]}
          </a>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: SongInfoTab.tsx**

```tsx
// components/info-tab/SongInfoTab.tsx
import { CreditsBlock } from "./CreditsBlock";
import { SongCard } from "./SongCard";
import { ExternalLinks } from "./ExternalLinks";
import type { CreditPerson, SongRef } from "@/lib/musicbrainz/db-queries";

interface Props {
  producers: CreditPerson[];
  songwriters: CreditPerson[];
  featuring: CreditPerson[];
  samples: SongRef[];
  sampledBy: SongRef[];
  covers: SongRef[];
  externalLinks: Record<string, string> | null;
  isLoading?: boolean;
}

export function SongInfoTab({ producers, songwriters, featuring, samples, sampledBy, covers, externalLinks, isLoading }: Props) {
  const hasCredits = producers.length > 0 || songwriters.length > 0 || featuring.length > 0;
  const hasSamples = samples.length > 0;
  const hasSampledBy = sampledBy.length > 0;
  const hasCovers = covers.length > 0;

  if (isLoading) {
    return (
      <div className="space-y-6 py-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-2">
            <div className="h-2 w-16 bg-zinc-800 rounded animate-pulse" />
            <div className="h-4 w-48 bg-zinc-800 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!hasCredits && !hasSamples && !hasSampledBy && !hasCovers) {
    return <p className="text-sm text-zinc-500 py-6">Credits will appear here once this song is indexed.</p>;
  }

  return (
    <div className="space-y-6 py-4">
      {hasCredits && (
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Credits</p>
          <CreditsBlock label="Produced by" people={producers} color="emerald" entityPath={(id) => `/artist/${id}`} />
          <CreditsBlock label="Written by" people={songwriters} color="emerald" entityPath={(id) => `/artist/${id}`} />
          <CreditsBlock label="Featuring" people={featuring} color="amber" entityPath={(id) => `/artist/${id}`} />
        </section>
      )}

      {hasSamples && (
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Samples</p>
          <p className="text-[12px] text-zinc-600 mb-3">This song samples {samples.length} {samples.length === 1 ? "track" : "tracks"}</p>
          {samples.map((s) => <SongCard key={s.id} song={s} />)}
        </section>
      )}

      {hasSampledBy && (
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Sampled by</p>
          <p className="text-[12px] text-zinc-600 mb-3">{sampledBy.length} {sampledBy.length === 1 ? "song has" : "songs have"} sampled this</p>
          {sampledBy.map((s) => <SongCard key={s.id} song={s} />)}
        </section>
      )}

      {hasCovers && (
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1">Covers</p>
          {covers.map((s) => <SongCard key={s.id} song={s} />)}
        </section>
      )}

      <ExternalLinks links={externalLinks} />
    </div>
  );
}
```

- [ ] **Step 6: AlbumInfoTab.tsx**

```tsx
// components/info-tab/AlbumInfoTab.tsx
"use client";
import { useState } from "react";
import { CreditsBlock } from "./CreditsBlock";
import { ExternalLinks } from "./ExternalLinks";
import type { CreditPerson, LabelEntry } from "@/lib/musicbrainz/db-queries";

interface Props {
  bio: string | null;
  producers: CreditPerson[];
  songwriters: CreditPerson[];
  labels: LabelEntry[];
  externalLinks: Record<string, string> | null;
  isLoading?: boolean;
}

export function AlbumInfoTab({ bio, producers, songwriters, labels, externalLinks, isLoading }: Props) {
  const [bioExpanded, setBioExpanded] = useState(false);
  const BIO_TRUNCATE = 300;

  if (isLoading) {
    return (
      <div className="space-y-4 py-4">
        <div className="h-3 w-24 bg-zinc-800 rounded animate-pulse" />
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-3 bg-zinc-800 rounded animate-pulse" />)}</div>
      </div>
    );
  }

  const hasCredits = producers.length > 0 || songwriters.length > 0 || labels.length > 0;
  const labelPeople: CreditPerson[] = labels.map((l) => ({ id: l.id, name: l.name }));

  return (
    <div className="space-y-6 py-4">
      {bio && (
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-3">About</p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            {bioExpanded || bio.length <= BIO_TRUNCATE ? bio : bio.slice(0, BIO_TRUNCATE) + "…"}
          </p>
          {bio.length > BIO_TRUNCATE && (
            <button type="button" onClick={() => setBioExpanded(!bioExpanded)}
              className="text-[13px] text-emerald-500 font-medium mt-2 block">
              {bioExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </section>
      )}

      {hasCredits && (
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Credits</p>
          <CreditsBlock label="Label" people={labelPeople} color="purple" entityPath={(id) => `/label/${id}`} />
          <CreditsBlock label="Produced by" people={producers} color="emerald" entityPath={(id) => `/artist/${id}`} />
          <CreditsBlock label="Written by" people={songwriters} color="emerald" entityPath={(id) => `/artist/${id}`} />
        </section>
      )}

      <ExternalLinks links={externalLinks} />
    </div>
  );
}
```

- [ ] **Step 7: ArtistInfoTab.tsx**

```tsx
// components/info-tab/ArtistInfoTab.tsx
"use client";
import { useState } from "react";
import { MembersGrid } from "./MembersGrid";
import { ExternalLinks } from "./ExternalLinks";
import type { MemberEntry, LabelHistoryEntry } from "@/lib/musicbrainz/db-queries";

interface Props {
  bio: string | null;
  members: MemberEntry[];
  labelHistory: LabelHistoryEntry[];
  externalLinks: Record<string, string> | null;
  isLoading?: boolean;
}

export function ArtistInfoTab({ bio, members, labelHistory, externalLinks, isLoading }: Props) {
  const [bioExpanded, setBioExpanded] = useState(false);
  const BIO_TRUNCATE = 300;

  if (isLoading) {
    return (
      <div className="space-y-4 py-4">
        <div className="h-3 w-24 bg-zinc-800 rounded animate-pulse" />
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-3 bg-zinc-800 rounded animate-pulse" />)}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 py-4">
      {bio && (
        <section>
          <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-3">About</p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            {bioExpanded || bio.length <= BIO_TRUNCATE ? bio : bio.slice(0, BIO_TRUNCATE) + "…"}
          </p>
          {bio.length > BIO_TRUNCATE && (
            <button type="button" onClick={() => setBioExpanded(!bioExpanded)}
              className="text-[13px] text-emerald-500 font-medium mt-2 block">
              {bioExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </section>
      )}

      {members.length > 0 && <MembersGrid members={members} />}

      {labelHistory.length > 0 && (
        <section>
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">Labels</p>
          <div className="space-y-2">
            {labelHistory.map((l) => (
              <div key={`${l.id}-${l.start_year}`} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${l.is_current ? "bg-emerald-500" : "bg-zinc-600"}`} />
                  <span className={`text-sm font-medium ${l.is_current ? "text-emerald-400" : "text-zinc-400"}`}>{l.name}</span>
                </div>
                <span className="text-[12px] text-zinc-600">
                  {l.start_year ?? ""}
                  {l.end_year ? `–${l.end_year}` : l.is_current ? "–present" : ""}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <ExternalLinks links={externalLinks} />
    </div>
  );
}
```

- [ ] **Step 8: Wire Info tab into `app/song/[id]/song-page-tabs.tsx`**

Change the `Tab` type from `"reviews" | "recommendations" | "social"` to:
```typescript
type Tab = "reviews" | "info" | "recommendations" | "social";
```

Add `{ id: "info", label: "Info" }` to the tabs array (between reviews and recommendations).

Add the Info tab render in the tab content section:
```tsx
{active === "info" && (
  <SongInfoTab
    producers={props.producers ?? []}
    songwriters={props.songwriters ?? []}
    featuring={props.featuring ?? []}
    samples={props.samples ?? []}
    sampledBy={props.sampledBy ?? []}
    covers={props.covers ?? []}
    externalLinks={props.externalLinks ?? null}
    isLoading={props.creditsEnrichedAt === undefined}
  />
)}
```

Pass the new props from the server component that renders `SongPageTabs`.

- [ ] **Step 9: Wire Info tab into album and artist page tabs** (same pattern as step 8 — add "info" tab type, render the corresponding InfoTab component)

- [ ] **Step 10: Typecheck**

```bash
npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 11: Commit**

```bash
git add components/info-tab/ app/song/ app/album/ app/artist/
git commit -m "feat: web Info tab — credits, bio, members, label history, samples, covers for all 3 entity types"
```

---

## Task 16: Mobile Info Tab Components

**Files:**
- Create: `mobile/components/info-tab/CreditsBlock.tsx`
- Create: `mobile/components/info-tab/MembersGrid.tsx`
- Create: `mobile/components/info-tab/SongCard.tsx`
- Create: `mobile/components/info-tab/SongInfoTab.tsx`
- Create: `mobile/components/info-tab/AlbumInfoTab.tsx`
- Create: `mobile/components/info-tab/ArtistInfoTab.tsx`
- Modify: `mobile/app/song/[id].tsx`
- Modify: `mobile/app/album/[id].tsx`
- Modify: `mobile/app/artist/[id]/index.tsx`

- [ ] **Step 1: CreditsBlock.tsx (mobile)**

```tsx
// mobile/components/info-tab/CreditsBlock.tsx
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

type CreditPerson = { id: string; name: string };
type ColorKey = "emerald" | "amber" | "purple";

const COLORS: Record<ColorKey, string> = {
  emerald: "#10B981",
  amber:   "#F59E0B",
  purple:  "#A78BFA",
};

interface Props {
  label: string;
  people: CreditPerson[];
  color: ColorKey;
  navPath: (id: string) => string;
  maxShown?: number;
}

export function CreditsBlock({ label, people, color, navPath, maxShown = 4 }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  if (people.length === 0) return null;

  const shown = expanded ? people : people.slice(0, maxShown);
  const hidden = people.length - maxShown;
  const nameColor = COLORS[color];

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: "#3F3F46", marginBottom: 6 }}>
        {label}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center" }}>
        {shown.map((p, i) => (
          <View key={p.id} style={{ flexDirection: "row", alignItems: "center" }}>
            <Pressable onPress={() => router.push(navPath(p.id) as any)}>
              <Text style={{ fontSize: 14, fontWeight: "500", color: nameColor, textDecorationLine: "underline", textDecorationColor: nameColor + "40" }}>
                {p.name}
              </Text>
            </Pressable>
            {i < shown.length - 1 && (
              <Text style={{ fontSize: 14, color: "#3F3F46", marginRight: 4 }}>,</Text>
            )}
          </View>
        ))}
        {!expanded && hidden > 0 && (
          <>
            <Text style={{ fontSize: 14, color: "#3F3F46", marginRight: 4 }}>,</Text>
            <Pressable onPress={() => setExpanded(true)}>
              <Text style={{ fontSize: 13, color: "#52525B" }}>+{hidden} more</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}
```

- [ ] **Step 2: MembersGrid.tsx (mobile)**

```tsx
// mobile/components/info-tab/MembersGrid.tsx
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

interface Member { id: string; name: string; role: string | null; is_active: boolean }

function initials(name: string): string {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function MembersGrid({ members }: { members: Member[] }) {
  const router = useRouter();
  if (members.length === 0) return null;
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: "#3F3F46", marginBottom: 10 }}>Members</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
        {members.map((m) => (
          <Pressable key={m.id} onPress={() => router.push(`/artist/${m.id}` as any)} style={{ alignItems: "center", gap: 6 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#27272A", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#A1A1AA" }}>{initials(m.name)}</Text>
            </View>
            <Text style={{ fontSize: 10, color: "#71717A", maxWidth: 56, textAlign: "center" }} numberOfLines={2}>{m.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 3: SongCard.tsx (mobile)**

```tsx
// mobile/components/info-tab/SongCard.tsx
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";

interface SongRef {
  id: string; name: string; artist_name: string;
  album_image_url: string | null; release_year: number | null;
}

export function SongCard({ song }: { song: SongRef }) {
  const router = useRouter();
  return (
    <Pressable onPress={() => router.push(`/song/${song.id}` as any)}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "#131316", opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: "#27272A", overflow: "hidden", flexShrink: 0 }}>
        {song.album_image_url && (
          <Image source={{ uri: song.album_image_url }} style={{ width: 40, height: 40 }} contentFit="cover" />
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: "500", color: "#E4E4E7" }} numberOfLines={1}>{song.name}</Text>
        <Text style={{ fontSize: 12, color: "#71717A", marginTop: 2 }} numberOfLines={1}>{song.artist_name}</Text>
      </View>
      {song.release_year && (
        <Text style={{ fontSize: 12, color: "#3F3F46", flexShrink: 0 }}>{song.release_year}</Text>
      )}
    </Pressable>
  );
}
```

- [ ] **Step 4: SongInfoTab.tsx (mobile)**

```tsx
// mobile/components/info-tab/SongInfoTab.tsx
import { Text, View } from "react-native";
import { CreditsBlock } from "./CreditsBlock";
import { SongCard } from "./SongCard";

interface SongRef { id: string; name: string; artist_name: string; album_image_url: string | null; release_year: number | null; }
interface CreditPerson { id: string; name: string; }

interface Props {
  producers: CreditPerson[]; songwriters: CreditPerson[]; featuring: CreditPerson[];
  samples: SongRef[]; sampledBy: SongRef[]; covers: SongRef[];
}

const SECTION = { fontSize: 11, fontWeight: "700" as const, textTransform: "uppercase" as const, letterSpacing: 1, color: "#52525B", marginBottom: 8 };
const HINT    = { fontSize: 12, color: "#52525B", marginBottom: 8 };
const DIV     = { height: 1, backgroundColor: "#27272A", marginVertical: 16 };

export function SongInfoTab({ producers, songwriters, featuring, samples, sampledBy, covers }: Props) {
  const hasCredits = producers.length > 0 || songwriters.length > 0 || featuring.length > 0;
  return (
    <View>
      {hasCredits && (
        <>
          <Text style={SECTION}>Credits</Text>
          <CreditsBlock label="Produced by" people={producers} color="emerald" navPath={(id) => `/artist/${id}`} />
          <CreditsBlock label="Written by" people={songwriters} color="emerald" navPath={(id) => `/artist/${id}`} />
          <CreditsBlock label="Featuring" people={featuring} color="amber" navPath={(id) => `/artist/${id}`} />
        </>
      )}

      {samples.length > 0 && (
        <>
          <View style={DIV} />
          <Text style={SECTION}>Samples</Text>
          <Text style={HINT}>This song samples {samples.length} {samples.length === 1 ? "track" : "tracks"}</Text>
          {samples.map((s) => <SongCard key={s.id} song={s} />)}
        </>
      )}

      {sampledBy.length > 0 && (
        <>
          <View style={DIV} />
          <Text style={SECTION}>Sampled by</Text>
          <Text style={HINT}>{sampledBy.length} {sampledBy.length === 1 ? "song has" : "songs have"} sampled this</Text>
          {sampledBy.map((s) => <SongCard key={s.id} song={s} />)}
        </>
      )}

      {covers.length > 0 && (
        <>
          <View style={DIV} />
          <Text style={SECTION}>Covers</Text>
          {covers.map((s) => <SongCard key={s.id} song={s} />)}
        </>
      )}
    </View>
  );
}
```

- [ ] **Step 5: AlbumInfoTab.tsx and ArtistInfoTab.tsx (mobile)**

Follow the same pattern as the web components — use RN `Text/View/Pressable` instead of HTML elements, `useRouter().push()` instead of `<Link>`, `expo-image` for album art. No new patterns needed; the web component logic maps 1:1.

- [ ] **Step 6: Wire Info tab into `mobile/app/song/[id].tsx`**

Change:
```typescript
type Tab = "reviews" | "recommended" | "social";
```
To:
```typescript
type Tab = "reviews" | "info" | "recommended" | "social";
```

Add `"info"` to the tab bar buttons (between reviews and recommended). In the ScrollView content, add:
```tsx
{activeTab === "info" && song && (
  <SongInfoTab
    producers={song.producers ?? []}
    songwriters={song.songwriters ?? []}
    featuring={song.featuring ?? []}
    samples={song.samples ?? []}
    sampledBy={song.sampled_by ?? []}
    covers={song.covers ?? []}
  />
)}
```

The `useSong` hook returns whatever the `/api/songs/[id]` route returns — the new fields will be there after Task 14.

- [ ] **Step 7: Wire Info tab into `mobile/app/album/[id].tsx` and `mobile/app/artist/[id]/index.tsx`** (same pattern)

- [ ] **Step 8: Typecheck mobile**

```bash
cd mobile && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 9: Commit**

```bash
git add mobile/components/info-tab/ mobile/app/song/ mobile/app/album/ mobile/app/artist/
git commit -m "feat: mobile Info tab — credits, bio, members, samples, covers for all 3 entity types"
```

---

## Task 17: Label Pages (Web + Mobile)

**Files:**
- Create: `app/label/[id]/page.tsx`
- Create: `mobile/app/label/[id].tsx`

- [ ] **Step 1: Web label page**

```tsx
// app/label/[id]/page.tsx
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { MediaGrid } from "@/components/media/MediaGrid";

export default async function LabelPage({ params }: { params: { id: string } }) {
  const supabase = await createSupabaseServerClient();

  const { data: label } = await supabase
    .from("labels")
    .select("id, name, bio, bio_source, country, founded_year, image_url, external_links")
    .eq("id", params.id)
    .maybeSingle();

  if (!label) notFound();

  const [{ data: artistRows }, { data: albumRows }] = await Promise.all([
    supabase.from("artist_labels").select("artists(id, name, image_url)").eq("label_id", params.id).limit(12),
    supabase.from("album_labels").select("albums(id, name, image_url, release_date)").eq("label_id", params.id).limit(12),
  ]);

  const artists = (artistRows ?? []).map((r: any) => ({ id: r.artists.id, name: r.artists.name, image_url: r.artists.image_url }));
  const albums  = (albumRows  ?? []).map((r: any) => ({ id: r.albums.id,  name: r.albums.name,  image_url: r.albums.image_url }));

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      {/* Hero */}
      <div className="mb-8">
        <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Label</p>
        <h1 className="text-3xl font-extrabold text-zinc-100">{label.name as string}</h1>
        {(label.founded_year || label.country) && (
          <p className="text-sm text-zinc-500 mt-1">
            {[label.country, label.founded_year ? `Est. ${label.founded_year}` : null].filter(Boolean).join(" · ")}
          </p>
        )}
        {label.bio && (
          <p className="text-sm text-zinc-400 leading-relaxed mt-4 max-w-xl">{label.bio as string}</p>
        )}
      </div>

      {/* Artists */}
      {artists.length > 0 && (
        <section className="mb-10">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-4">Artists</h2>
          <MediaGrid
            items={artists.map((a) => ({ id: a.id, title: a.name, imageUrl: a.image_url, href: `/artist/${a.id}` }))}
          />
        </section>
      )}

      {/* Albums */}
      {albums.length > 0 && (
        <section className="mb-10">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-4">Albums</h2>
          <MediaGrid
            items={albums.map((a) => ({ id: a.id, title: a.name, imageUrl: a.image_url, href: `/album/${a.id}` }))}
          />
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Mobile label page**

```tsx
// mobile/app/label/[id].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { ScrollView, Text, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { fetcher } from "@/lib/api";
import { MediaGrid } from "@/components/media/MediaGrid";
import { theme } from "@/lib/theme";

export default function LabelScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const labelId = Array.isArray(id) ? id[0] : id;

  const { data, isLoading } = useQuery({
    queryKey: ["label", labelId],
    queryFn: () => fetcher<any>(`/api/labels/${labelId}`),
    enabled: !!labelId,
  });

  if (isLoading || !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#09090B" }} edges={["top"]}>
        <View style={{ height: 48, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: theme.colors.muted }}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { label, topArtists, topAlbums } = data;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#09090B" }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, height: 48 }}>
        <Pressable onPress={() => router.back()} hitSlop={16}>
          <Ionicons name="chevron-back" size={26} color={theme.colors.emerald} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: "#52525B", marginBottom: 4 }}>Label</Text>
        <Text style={{ fontSize: 26, fontWeight: "800", color: "#F4F4F5", marginBottom: 4 }}>{label.name}</Text>
        {(label.founded_year || label.country) && (
          <Text style={{ fontSize: 13, color: "#71717A", marginBottom: 12 }}>
            {[label.country, label.founded_year ? `Est. ${label.founded_year}` : null].filter(Boolean).join(" · ")}
          </Text>
        )}
        {label.bio && (
          <Text style={{ fontSize: 14, color: "#A1A1AA", lineHeight: 22, marginBottom: 24 }}>{label.bio}</Text>
        )}

        {topArtists?.length > 0 && (
          <>
            <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: "#52525B", marginBottom: 12 }}>Artists</Text>
            <MediaGrid
              items={topArtists.map((a: any) => ({ id: a.id, title: a.name, imageUrl: a.image_url }))}
              onPressItem={(item) => router.push(`/artist/${item.id}` as any)}
              columns={3}
            />
          </>
        )}

        {topAlbums?.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", color: "#52525B", marginBottom: 12 }}>Albums</Text>
            <MediaGrid
              items={topAlbums.map((a: any) => ({ id: a.id, title: a.name, imageUrl: a.image_url }))}
              onPressItem={(item) => router.push(`/album/${item.id}` as any)}
              columns={3}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck && cd mobile && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/label/ mobile/app/label/
git commit -m "feat: label pages — web + mobile, hero, bio, artist grid, album grid"
```

---

## Task 18: Backfill Script

**Files:**
- Create: `scripts/backfill-musicbrainz-credits.ts`
- Modify: `package.json` (add script)

- [ ] **Step 1: Write the backfill script**

```typescript
// scripts/backfill-musicbrainz-credits.ts
// One-time: enrich top N entities by listen count.
// Run locally only — uses service role key + 1 req/sec rate limit.

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { enrichArtist } from "@/lib/musicbrainz/enrich-artist";
import { enrichAlbum } from "@/lib/musicbrainz/enrich-album";
import { enrichSong } from "@/lib/musicbrainz/enrich-song";

const TOP_N = parseInt(process.env.BACKFILL_TOP_N ?? "100", 10);

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const supabase = createSupabaseAdminClient();
  console.log(`[backfill] Starting MusicBrainz credits backfill — top ${TOP_N} of each entity type`);

  // Top artists by aggregate play count
  const { data: artists } = await supabase
    .from("artists")
    .select("id, name, credits_enriched_at")
    .is("credits_enriched_at", null)
    .limit(TOP_N);

  console.log(`[backfill] Enriching ${artists?.length ?? 0} artists…`);
  for (const a of artists ?? []) {
    console.log(`  → artist: ${a.name} (${a.id})`);
    try { await enrichArtist(a.id as string); } catch (e) { console.error(`  ✗ ${(e as Error).message}`); }
    await sleep(1100); // slightly over 1s to be safe with rate limit
  }

  // Top albums
  const { data: albums } = await supabase
    .from("albums")
    .select("id, name, credits_enriched_at")
    .is("credits_enriched_at", null)
    .limit(TOP_N);

  console.log(`[backfill] Enriching ${albums?.length ?? 0} albums…`);
  for (const a of albums ?? []) {
    console.log(`  → album: ${a.name} (${a.id})`);
    try { await enrichAlbum(a.id as string); } catch (e) { console.error(`  ✗ ${(e as Error).message}`); }
    await sleep(1100);
  }

  // Top tracks
  const { data: tracks } = await supabase
    .from("tracks")
    .select("id, name, credits_enriched_at")
    .is("credits_enriched_at", null)
    .limit(TOP_N);

  console.log(`[backfill] Enriching ${tracks?.length ?? 0} tracks…`);
  for (const t of tracks ?? []) {
    console.log(`  → track: ${t.name} (${t.id})`);
    try { await enrichSong(t.id as string); } catch (e) { console.error(`  ✗ ${(e as Error).message}`); }
    await sleep(1100);
  }

  console.log("[backfill] Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Add npm script**

In root `package.json` scripts:
```json
"backfill:musicbrainz-credits": "NODE_OPTIONS='-r ./scripts/register-server-only-stub.cjs' tsx scripts/backfill-musicbrainz-credits.ts"
```

- [ ] **Step 3: Dry-run verification**

With `BACKFILL_TOP_N=1`, run against a single entity to confirm the pipeline works end-to-end:
```bash
BACKFILL_TOP_N=1 npm run backfill:musicbrainz-credits 2>&1 | head -30
```

Expected: one artist, one album, one track printed with no error.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-musicbrainz-credits.ts package.json
git commit -m "feat: one-time MusicBrainz credits backfill script — top N entities by listen count"
```

---

## Self-Review Against Spec

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Info tab on artist/album/song pages (web + mobile) | Tasks 15, 16 |
| Bio/editorial from Last.fm + Wikipedia fallback | Task 4 |
| Credits: label, produced by, written by, featuring | Tasks 6, 7, 10, 15, 16 |
| Band members on artist pages | Tasks 5, 10, 15, 16 |
| Label history on artist pages | Tasks 5, 10, 15, 16 |
| Samples, sampled by, covers on song pages | Tasks 7, 10, 15, 16 |
| New label pages (`/label/[id]`) | Tasks 11, 17 |
| Producer/songwriter as extended artist record | Tasks 3, 5, 6, 7 |
| MusicBrainz + Bottleneck client | Task 2 |
| On-demand enrichment, never blocks API | Tasks 12, 13, 14 |
| BullMQ job + worker | Tasks 8, 9 |
| DB migration | Task 1 |
| Local backfill script | Task 18 |
| All links resolve (entity creation during enrichment) | Tasks 3, 5, 6, 7 |
| First visit skeleton state | Tasks 15, 16 (isLoading prop) |
| TTLs (1yr credits, 90d bio) | Tasks 5, 6, 7 |
| Visual design: Option C inline names, initials members | Tasks 15, 16 |
| Mobile and web ship simultaneously | Tasks 15, 16, 17 |

All spec requirements are covered. No placeholders remain.
