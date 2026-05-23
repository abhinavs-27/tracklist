# Entity Page Enrichment — Credits, Bio & Info Tab

**Date:** 2026-05-23  
**Status:** Approved  

---

## Goal

Give artist, album, and song pages enough informational depth that users have a reason to visit them without any social data yet. Modelled on Letterboxd's entity pages: rich credits, biographical context, and graph navigation ("see what else this person worked on"). All three entity types ship together on both web and mobile.

---

## Scope

**In scope:**
- Info tab added to artist, album, and song pages (web + mobile simultaneously)
- Bio/editorial content: artist bio, album notes (Last.fm primary, Wikipedia fallback)
- Credits on album and song pages: label, produced by, written by, featuring
- Band member relationships on artist pages
- Label history on artist pages
- Samples, sampled by, and covers on song pages
- New entity pages: labels (`/label/[id]`), and producer/songwriter pages (extended artist pages at `/artist/[id]`)
- MusicBrainz + Last.fm + Wikipedia enrichment pipeline (on-demand, long TTLs)
- One-time local backfill script for top N entities by listen count

**Out of scope:**
- Related/similar artists (deferred)
- Band member era/timeline tracking (members shown as current roster only)
- WhoSampled API integration (samples from MusicBrainz only)
- Songwriter pages as a separate entity type (songwriters are extended artist records)

---

## Data Model

### New tables

**`labels`**
```
id              UUID PK
name            TEXT NOT NULL
name_normalized TEXT
mbid            TEXT UNIQUE          -- MusicBrainz label ID
bio             TEXT
bio_source      TEXT                 -- 'wikipedia' | 'musicbrainz'
country         TEXT
founded_year    INT
image_url       TEXT
external_links  JSONB                -- { wikipedia, official_site, discogs, ... }
enriched_at     TIMESTAMPTZ          -- credits/bio enrichment timestamp (1yr TTL)
bio_enriched_at TIMESTAMPTZ          -- bio-specific timestamp (90d TTL)
created_at      TIMESTAMPTZ DEFAULT now()
```

**Junction tables** (all FKs reference `artists.id` or existing entity tables)
```
artist_labels       (artist_id, label_id, start_year INT, end_year INT, is_current BOOL)
album_labels        (album_id, label_id)
album_producers     (album_id, artist_id)
album_songwriters   (album_id, artist_id)
song_producers      (song_id, artist_id)
song_songwriters    (song_id, artist_id)
song_samples        (song_id, sampled_song_id)   -- song samples sampled_song
song_covers         (song_id, original_song_id)  -- song is a cover of original_song
artist_members      (artist_id, member_artist_id, role TEXT, is_active BOOL)
```

Featuring credits come from the Spotify track artists array (Spotify returns all artists per track, main + features). As part of the migration, verify whether the existing track upsert logic stores all artists per track or only the primary. If only primary: add an `is_feature` boolean to the existing track-artist junction and backfill from Spotify data. If all artists are already stored: add the `is_feature` flag only.

### Extensions to existing tables

**`artists`** — add columns:
```
is_producer         BOOL DEFAULT false
is_songwriter       BOOL DEFAULT false
bio                 TEXT
bio_source          TEXT                 -- 'lastfm' | 'wikipedia' | 'musicbrainz'
bio_enriched_at     TIMESTAMPTZ          -- 90-day TTL
mbid                TEXT UNIQUE          -- MusicBrainz artist ID
external_links      JSONB
credits_enriched_at TIMESTAMPTZ          -- 1-year TTL
```

**`albums`** — add columns:
```
bio                 TEXT
bio_source          TEXT
bio_enriched_at     TIMESTAMPTZ          -- 90-day TTL
mbid                TEXT UNIQUE
release_type        TEXT                 -- 'album' | 'ep' | 'live' | 'compilation' | 'single'
credits_enriched_at TIMESTAMPTZ          -- 1-year TTL
```

**`tracks`/`songs`** — add columns:
```
mbid                TEXT UNIQUE
credits_enriched_at TIMESTAMPTZ          -- 1-year TTL
```

### Key schema decision

Producers and songwriters are extended `artists` records — not a separate entity type. The same person (e.g. Kanye West) appears once in `artists` with `is_producer: true` and `is_songwriter: true`. Their artist page adapts its sections based on which flags are set. All junction tables reference `artists.id`. Labels are a separate entity (not artists) since they have no Spotify presence and a distinct data shape.

---

## Data Sources

| Source | What we get | Notes |
|--------|-------------|-------|
| **Spotify** | Featuring artists, artist images, discography | Already integrated; featuring data already in DB |
| **Last.fm** | Artist bio, album wiki/notes | `LASTFM_API_KEY` already in env |
| **MusicBrainz** | Credits (produced by, written by, label, members), samples, covers, external links, release type | Free, no key needed; 1 req/sec rate limit |
| **Wikipedia** | Bio text for labels and producers with no Last.fm entry | Free REST API, no key needed |

MusicBrainz is the primary credits source. The Spotify ID is used to look up the MusicBrainz entity via its external links endpoint: `GET /ws/2/url?resource=https://open.spotify.com/artist/{spotifyId}&inc=artist-rels&fmt=json`. This returns the MBID, which is stored and used for all subsequent lookups.

---

## Enrichment Pipeline

### Trigger

When an artist, album, or song page is requested, the API route checks `credits_enriched_at`:
- If `null` → enqueue enrichment immediately, return whatever data exists (may be empty on first visit)
- If older than TTL (1 year for credits, 90 days for bio) → enqueue re-enrichment, serve stale data
- If fresh → serve cached data, no enrichment needed

Enrichment never blocks the API response.

### TTLs

- Credits (producers, songwriters, labels, members, samples, covers): **1 year**
- Bio content (Last.fm, Wikipedia text): **90 days**
- External links: **1 year**

### Job: `musicbrainz-enrich`

New BullMQ job type alongside the existing Spotify enrichment worker. Handles all three entity types with a `entityType` + `entityId` payload.

**Artist enrichment steps:**
1. Resolve MBID via Spotify external links endpoint
2. Fetch artist with `inc=artist-rels,url-rels` from MusicBrainz
3. Parse member-of relationships → upsert each member as an `artists` record, write `artist_members` rows
4. Parse label relationships → upsert `labels` records, write `artist_labels` rows
5. Parse external links → store in `artists.external_links`
6. Fetch bio from Last.fm `artist.getInfo`, fall back to Wikipedia extract
7. Update `artists.bio`, `bio_source`, `bio_enriched_at`, `mbid`, `credits_enriched_at`

**Album enrichment steps:**
1. Resolve MBID via Spotify external links endpoint
2. Fetch release with `inc=artist-rels,label-rels,url-rels,recording-rels` from MusicBrainz
3. Parse label → upsert `labels`, write `album_labels`
4. Parse produced-by relationships → upsert producer `artists` records (with `is_producer: true`), write `album_producers`
5. Parse written-by relationships → upsert songwriter `artists` records (with `is_songwriter: true`), write `album_songwriters`
6. Parse release type → update `albums.release_type`
7. Fetch album bio from Last.fm `album.getInfo`
8. Update `albums.bio`, `bio_source`, `bio_enriched_at`, `mbid`, `credits_enriched_at`

**Song enrichment steps:**
1. Resolve recording MBID
2. Fetch recording with `inc=artist-rels,work-rels` from MusicBrainz
3. Parse produced-by → upsert producer artists, write `song_producers`
4. Fetch work relationships for the recording → parse written-by → write `song_songwriters`
5. Parse "samples material from" → write `song_samples` (both directions)
6. Parse "is a cover of" → write `song_covers`
7. Update `credits_enriched_at`

### Entity creation during enrichment

Credit entities (producers, songwriters, label staff) are created during enrichment — not on click. When enrichment encounters a producer:
1. Check if artist exists by MBID or name-normalized match
2. If not found: insert minimal `artists` record with `data_source: 'musicbrainz'`, `is_producer: true`, name, MBID
3. Check MusicBrainz external links for a Spotify URL on that person
4. If found: link Spotify ID, queue Spotify enrichment for photo + full metadata
5. If no Spotify presence: artist page shows name + bio (from Wikipedia) + their productions only

By the time a user sees credits on the Info tab, all linked entities have DB records. Links always resolve.

### Infrastructure

- New Bottleneck instance for MusicBrainz at **1 req/sec** (same pattern as Spotify client)
- New worker script: `npm run worker:musicbrainz-enrich`
- For Vercel deployments: enrichment triggered via `waitUntil()` in the API route handler — no always-on worker needed
- Label bio fetched from Wikipedia REST API (`/api/rest_v1/page/summary/{title}`)

### Local backfill script

One-time script (`npm run backfill:musicbrainz-credits`) that:
1. Queries top N artists/albums by listen count from DB
2. Enqueues enrichment jobs sequentially (respects 1 req/sec)
3. Run once locally to pre-populate the most-visited entities
4. Long tail fills in on-demand through normal traffic

---

## New Entity Pages

### Label page (`/label/[id]`)

**URL:** `/label/[id]` (web), `mobile/app/label/[id].tsx` (mobile)

**Sections:**
- Hero: label name, logo/image, bio (collapsible), founded year, country, external links
- Stats row: total artists, total albums, aggregate catalog listens
- Artists grid: top 12 artists on the label, "See all" → paginated list
- Albums grid: top 12 albums released on this label, "See all" → paginated list

### Producer/songwriter artist page

No new route. `/artist/[id]` adapts based on flags:

| Flags | Page leads with |
|-------|----------------|
| performer only | Discography |
| `is_producer` only | Productions (albums/songs produced) |
| `is_songwriter` only | Written (songs/albums written) |
| both | Discography + Productions + Written sections |
| any | Always shows Info tab with bio, credits, links |

---

## Info Tab

Added to all three entity types. Contains all new informational content — existing tabs are completely unchanged.

### Tab structure

| Entity | Tabs |
|--------|------|
| Album  | Tracks · **Info** · Reviews · Social |
| Artist | General · **Info** · Social |
| Song   | Reviews · **Info** · Social |

### Info tab contents

**Album Info tab:**
- About (Last.fm bio, collapsible after 3 lines, "Show more")
- Credits section with groups: Label, Produced by, Written by, Featuring
- Links row (Wikipedia, Discogs, AllMusic, official site)

**Artist Info tab:**
- About (Last.fm bio, collapsible)
- Members (initials grid — each card taps to that member's artist page; only shown for bands)
- Labels (chronological history with start/end years; current label highlighted)
- Links row

**Song Info tab:**
- Credits section: Produced by, Written by, Featuring
- Samples (song reference cards — art thumbnail, title, artist, year)
- Sampled by (same card format, with count hint e.g. "3 songs have sampled this")
- Covers (same card format)
- Links row

### First visit state

If `credits_enriched_at` is null, the Info tab shows a skeleton/loading state with placeholder rows. On next visit, full data is shown. Bio section (`bio_enriched_at`) follows the same pattern independently.

---

## Visual Design

### Credits — inline colored names (Option C)

Credits displayed as inline text with colored, underlined names. No chip borders, no card containers per group.

```
PRODUCED BY
DJ Dahi

WRITTEN BY
Kendrick Lamar,  Jay Rock,  DJ Dahi

FEATURING
Jay Rock
```

- Emerald (`#10B981`) for producers and songwriters
- Amber (`#F59E0B`) for featuring artists
- Purple (`#A78BFA`) for labels
- Group label in zinc-600 uppercase, 10px
- Name underline (`border-bottom: 1px solid color/30`) signals tappability; full underline on hover
- "+N more" in zinc-500 expands inline to show all names as a chip grid; "Show less" collapses

### Members — initials grid

Same pattern as the existing artist members grid. No avatars, no emojis. Ever.

- 44px circle, zinc-800 background, zinc-400 initials
- Name below in 10px zinc-500
- Hover: circle border goes emerald
- Taps to that member's artist page

### Song reference cards (samples / sampled by / covers)

Full-width rows with:
- 40px album art thumbnail (6px border radius)
- Song title (14px, zinc-100) + artist name below (12px, zinc-500)
- Release year flush right (12px, zinc-600)
- Full row is tappable → song page

### Label history (artist Info tab)

Vertical list. Current label: emerald dot + emerald text. Past labels: zinc dot + zinc text. Years flush right.

---

## API Routes

### New routes

| Route | Returns |
|-------|---------|
| `GET /api/labels/[id]` | Bio, founded year, country, external links, top artists (12), top albums (12), aggregate stats |
| `GET /api/labels/[id]/artists` | Paginated full artist roster |
| `GET /api/labels/[id]/albums` | Paginated full album catalog |

### Modified routes — new fields added to existing responses

| Route | New fields |
|-------|-----------|
| `GET /api/artists/[id]` | `bio`, `mbid`, `external_links`, `members[]`, `label_history[]`, `is_producer`, `is_songwriter`, `productions[]` (if producer, top 20), `written[]` (if songwriter, top 20), `featured_on[]` (top 20) |
| `GET /api/artists/[id]/detail-bundle` | Same additions as above |
| `GET /api/albums/[id]` | `bio`, `release_type`, `mbid`, `label[]`, `producers[]`, `songwriters[]`, `external_links` |
| `GET /api/songs/[id]` | `producers[]`, `songwriters[]`, `samples[]`, `sampled_by[]`, `covers[]` |

All credit arrays return objects with `{ id, name, mbid }` minimum — enough to render and navigate.

---

## Platform

Web and mobile ship simultaneously. Mobile uses the same tab pattern (`activeTab` state) and the same data from the same API routes. The mobile Info tab renders:
- Credits inline (same Option C style)
- Member grid (same initials circles)
- Song reference cards (same row style as existing activity rows)
- External links as small pill buttons

No new mobile-specific bundle endpoint needed — the existing detail-bundle endpoints will carry the new fields.

---

## Migration plan

1. Write and run DB migrations for new columns and tables
2. Add MusicBrainz client with Bottleneck rate limiter (`packages/musicbrainz-client/`)
3. Add Last.fm enrichment functions for bio (Last.fm client already exists)
4. Implement `musicbrainz-enrich` BullMQ job
5. Add worker script
6. Modify existing API routes to return new fields
7. Add new `/api/labels/[id]` routes
8. Add Info tab to web — album, artist, song pages
9. Add Info tab to mobile — album, artist, song pages
10. Add label pages (web + mobile)
11. Write and run local backfill script for top entities
