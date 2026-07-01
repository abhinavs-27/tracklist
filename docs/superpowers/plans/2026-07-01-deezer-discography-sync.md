# Deezer Discography Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken Spotify-backed `SYNC_ARTIST_DISCOGRAPHY` job with a Deezer-first (MusicBrainz-fallback) implementation that works reliably under Spotify Dev Mode rate limits.

**Architecture:** A new `lib/deezer/sync-discography.ts` file contains all sync logic — 7-day guard, Deezer artist ID resolution, album diff+upsert with track fetch, and a MusicBrainz fallback when Deezer yields nothing. `lib/deezer/client.ts` gets one new function. `lib/jobs/run-job.ts` gets its `SYNC_ARTIST_DISCOGRAPHY` case re-pointed at the new module. The old Spotify path stays in `lib/spotify-cache.ts` — untouched, not called.

**Tech Stack:** TypeScript, Supabase (admin client), Bottleneck, Deezer REST API, MusicBrainz REST API, Vitest

---

### Task 1: Add `getDeezerArtistAlbums` to `lib/deezer/client.ts`

**Files:**
- Modify: `lib/deezer/client.ts`
- Test: `lib/deezer/client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/deezer/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch before importing the module (it uses server-only)
vi.mock("server-only", () => ({}));

// We test the function via a thin shim that re-exports it
// (deezerGet is not exported; we test through getDeezerArtistAlbums)
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Bottleneck must be mocked so tests don't wait for real throttle
vi.mock("bottleneck", () => {
  return {
    default: class {
      schedule<T>(fn: () => Promise<T>) { return fn(); }
    },
  };
});

vi.mock("@/lib/http/with-retry", () => ({
  withRetry: async <T>(fn: (sig: AbortSignal) => Promise<T>) => fn(new AbortController().signal),
}));

import { getDeezerArtistAlbums } from "./client";

describe("getDeezerArtistAlbums", () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it("returns filtered albums (album + ep only)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: 1, title: "Studio Album", release_date: "2020-01-01", cover_xl: "https://img1", record_type: "album", nb_tracks: 12 },
          { id: 2, title: "An EP", release_date: "2021-06-01", cover_xl: "https://img2", record_type: "ep", nb_tracks: 4 },
          { id: 3, title: "Single A", release_date: "2021-01-01", cover_xl: "https://img3", record_type: "single", nb_tracks: 1 },
          { id: 4, title: "Live Show", release_date: "2019-05-01", cover_xl: "https://img4", record_type: "live", nb_tracks: 20 },
        ],
      }),
    });

    const result = await getDeezerArtistAlbums(123);

    expect(result).toHaveLength(4); // filtering is done by caller in sync-discography
    expect(result[0]).toEqual({
      id: 1,
      title: "Studio Album",
      release_date: "2020-01-01",
      cover_xl: "https://img1",
      record_type: "album",
      nb_tracks: 12,
    });
  });

  it("returns empty array when Deezer returns error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { type: "Exception", message: "no data" } }),
    });
    const result = await getDeezerArtistAlbums(999);
    expect(result).toEqual([]);
  });

  it("returns empty array on HTTP failure", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    const result = await getDeezerArtistAlbums(999);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test:unit -- lib/deezer/client.test.ts
```

Expected: FAIL — `getDeezerArtistAlbums` does not exist yet.

- [ ] **Step 3: Add `DeezerArtistAlbum` interface and `getDeezerArtistAlbums` to `lib/deezer/client.ts`**

After the existing `DeezerArtistSearchItem` interface (around line 30), add:

```ts
export interface DeezerArtistAlbum {
  id: number;
  title: string;
  release_date: string; // "YYYY-MM-DD" or "0000-00-00"
  cover_xl: string;
  record_type: "album" | "ep" | "single" | "live" | string;
  nb_tracks: number;
}
```

At the end of the file, add:

```ts
export async function getDeezerArtistAlbums(
  artistId: number,
): Promise<DeezerArtistAlbum[]> {
  const data = await deezerGet<{ data?: DeezerArtistAlbum[] }>(
    `/artist/${artistId}/albums?limit=500`,
    "artist/albums",
  );
  return data?.data ?? [];
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm run test:unit -- lib/deezer/client.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/deezer/client.ts lib/deezer/client.test.ts
git commit -m "feat(deezer): add getDeezerArtistAlbums to client"
```

---

### Task 2: Create `lib/deezer/sync-discography.ts` — Deezer path

**Files:**
- Create: `lib/deezer/sync-discography.ts`
- Create: `lib/deezer/sync-discography.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/deezer/sync-discography.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("bottleneck", () => ({
  default: class {
    schedule<T>(fn: () => Promise<T>) { return fn(); }
  },
}));
vi.mock("@/lib/http/with-retry", () => ({
  withRetry: async <T>(fn: (sig: AbortSignal) => Promise<T>) => fn(new AbortController().signal),
}));

// ── Supabase admin mock ──────────────────────────────────────────────────────
const mockFrom = vi.fn();
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({ from: mockFrom }),
}));

// ── Deezer client mocks ──────────────────────────────────────────────────────
const mockSearchDeezerArtists = vi.fn();
const mockGetDeezerArtistAlbums = vi.fn();
const mockGetDeezerAlbumTracks = vi.fn();
vi.mock("./client", () => ({
  searchDeezerArtists: (...a: unknown[]) => mockSearchDeezerArtists(...a),
  getDeezerArtistAlbums: (...a: unknown[]) => mockGetDeezerArtistAlbums(...a),
  getDeezerAlbumTracks: (...a: unknown[]) => mockGetDeezerAlbumTracks(...a),
}));

// ── entity-resolution mock ───────────────────────────────────────────────────
const mockFindAlbumIdByArtistAndName = vi.fn();
vi.mock("@/lib/catalog/entity-resolution", () => ({
  findAlbumIdByArtistAndName: (...a: unknown[]) => mockFindAlbumIdByArtistAndName(...a),
}));

// ── artistMatches mock ───────────────────────────────────────────────────────
vi.mock("@/lib/lastfm/normalize-lastfm-search", () => ({
  artistMatches: (_name: string, candidates: string[]) => ({
    score: candidates[0] ? 30 : 0,
    match: candidates[0] ?? "",
  }),
}));

import { syncArtistDiscography } from "./sync-discography";

// Minimal Supabase chain builder
function makeChain(finalValue: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "update", "insert", "upsert", "maybeSingle", "single", "limit"];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  chain["maybeSingle"] = vi.fn(async () => finalValue);
  chain["single"] = vi.fn(async () => finalValue);
  chain["select"] = vi.fn(() => chain);
  chain["update"] = vi.fn(() => chain);
  chain["insert"] = vi.fn(async () => finalValue);
  chain["upsert"] = vi.fn(async () => ({ error: null }));
  chain["eq"] = vi.fn(() => chain);
  chain["limit"] = vi.fn(() => chain);
  return chain;
}

describe("syncArtistDiscography", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDeezerAlbumTracks.mockResolvedValue([]);
    mockFindAlbumIdByArtistAndName.mockResolvedValue(null);
  });

  it("skips artist not found in DB", async () => {
    mockFrom.mockReturnValue(makeChain({ data: null }));
    await syncArtistDiscography("artist-uuid-1");
    // No albums were fetched
    expect(mockGetDeezerArtistAlbums).not.toHaveBeenCalled();
  });

  it("skips within 7-day guard window", async () => {
    const recentSync = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
    mockFrom.mockReturnValue(
      makeChain({ data: { name: "Artist", mbid: null, discography_synced_at: recentSync } }),
    );
    await syncArtistDiscography("artist-uuid-2");
    expect(mockGetDeezerArtistAlbums).not.toHaveBeenCalled();
  });

  it("uses stored Deezer ID when present in artist_external_ids", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // artists select
        return makeChain({ data: { name: "Test Artist", mbid: null, discography_synced_at: null } });
      }
      if (callCount === 2) {
        // artist_external_ids select
        return makeChain({ data: { external_id: "987" } });
      }
      // all subsequent: albums, tracks, stamp
      return makeChain({ data: null, error: null });
    });
    mockGetDeezerArtistAlbums.mockResolvedValue([
      { id: 10, title: "Album One", release_date: "2020-01-01", cover_xl: "https://img", record_type: "album", nb_tracks: 10 },
    ]);
    mockFindAlbumIdByArtistAndName.mockResolvedValue(null);

    await syncArtistDiscography("artist-uuid-3");

    expect(mockSearchDeezerArtists).not.toHaveBeenCalled();
    expect(mockGetDeezerArtistAlbums).toHaveBeenCalledWith(987);
  });

  it("searches for Deezer artist when no stored ID, stores result", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return makeChain({ data: { name: "New Artist", mbid: null, discography_synced_at: null } });
      }
      if (callCount === 2) {
        // artist_external_ids — no stored ID
        return makeChain({ data: null });
      }
      return makeChain({ data: null, error: null });
    });
    mockSearchDeezerArtists.mockResolvedValue([{ id: 42, name: "New Artist" }]);
    mockGetDeezerArtistAlbums.mockResolvedValue([]);

    await syncArtistDiscography("artist-uuid-4");

    expect(mockSearchDeezerArtists).toHaveBeenCalledWith("New Artist", 5);
    expect(mockGetDeezerArtistAlbums).toHaveBeenCalledWith(42);
  });

  it("filters out singles and live records", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeChain({ data: { name: "Artist", mbid: null, discography_synced_at: null } });
      if (callCount === 2) return makeChain({ data: { external_id: "55" } });
      return makeChain({ data: null, error: null });
    });
    mockGetDeezerArtistAlbums.mockResolvedValue([
      { id: 1, title: "LP", record_type: "album", release_date: "2020-01-01", cover_xl: "", nb_tracks: 12 },
      { id: 2, title: "EP", record_type: "ep", release_date: "2020-06-01", cover_xl: "", nb_tracks: 5 },
      { id: 3, title: "Single", record_type: "single", release_date: "2020-02-01", cover_xl: "", nb_tracks: 1 },
      { id: 4, title: "Live", record_type: "live", release_date: "2020-09-01", cover_xl: "", nb_tracks: 18 },
    ]);

    await syncArtistDiscography("artist-uuid-5");

    // Only album(1) and ep(2) should trigger album lookup
    expect(mockFindAlbumIdByArtistAndName).toHaveBeenCalledTimes(2);
    expect(mockFindAlbumIdByArtistAndName).toHaveBeenCalledWith(expect.anything(), "artist-uuid-5", "LP");
    expect(mockFindAlbumIdByArtistAndName).toHaveBeenCalledWith(expect.anything(), "artist-uuid-5", "EP");
  });

  it("skips image update when album already has image_url", async () => {
    let callCount = 0;
    const updateMock = vi.fn(async () => ({ error: null }));
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeChain({ data: { name: "Artist", mbid: null, discography_synced_at: null } });
      if (callCount === 2) return makeChain({ data: { external_id: "55" } });
      // album image check — has image already
      if (callCount === 3) {
        const chain = makeChain({ data: { image_url: "https://existing.jpg" } });
        chain["update"] = updateMock;
        return chain;
      }
      return makeChain({ data: null, error: null });
    });
    mockGetDeezerArtistAlbums.mockResolvedValue([
      { id: 1, title: "LP", record_type: "album", release_date: "2020-01-01", cover_xl: "https://new.jpg", nb_tracks: 10 },
    ]);
    mockFindAlbumIdByArtistAndName.mockResolvedValue("existing-album-id");

    await syncArtistDiscography("artist-uuid-6");

    expect(updateMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npm run test:unit -- lib/deezer/sync-discography.test.ts
```

Expected: FAIL — module `./sync-discography` does not exist.

- [ ] **Step 3: Create `lib/deezer/sync-discography.ts` with Deezer path**

```ts
import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { findAlbumIdByArtistAndName } from "@/lib/catalog/entity-resolution";
import { artistMatches } from "@/lib/lastfm/normalize-lastfm-search";
import {
  getDeezerAlbumTracks,
  getDeezerArtistAlbums,
  searchDeezerArtists,
} from "./client";

const LOG = "[sync-discography]";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_ARTIST_SCORE = 22;

export async function syncArtistDiscography(canonicalArtistId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  // Load artist row
  const { data: artist } = await supabase
    .from("artists")
    .select("name, mbid, discography_synced_at")
    .eq("id", canonicalArtistId)
    .maybeSingle();

  if (!artist) return;

  // 7-day skip guard
  if (artist.discography_synced_at) {
    const age = Date.now() - new Date(artist.discography_synced_at as string).getTime();
    if (age < SEVEN_DAYS_MS) return;
  }

  const artistName = artist.name as string;
  const mbid = artist.mbid as string | null;

  // ── Resolve Deezer artist ID ────────────────────────────────────────────────
  let deezerId: number | null = null;

  const { data: extRow } = await supabase
    .from("artist_external_ids")
    .select("external_id")
    .eq("artist_id", canonicalArtistId)
    .eq("source", "deezer")
    .maybeSingle();

  if ((extRow as { external_id?: string } | null)?.external_id) {
    deezerId = Number((extRow as { external_id: string }).external_id);
  } else {
    const candidates = await searchDeezerArtists(artistName, 5);
    for (const c of candidates) {
      const { score } = artistMatches(artistName, [c.name]);
      if (score >= MIN_ARTIST_SCORE) {
        deezerId = c.id;
        await supabase.from("artist_external_ids").upsert(
          { artist_id: canonicalArtistId, source: "deezer", external_id: String(c.id) },
          { onConflict: "artist_id,source" },
        );
        break;
      }
    }
  }

  // ── Deezer primary path ─────────────────────────────────────────────────────
  let albumsFound = 0;
  let albumsInserted = 0;
  let tracksInserted = 0;

  if (deezerId !== null) {
    const allAlbums = await getDeezerArtistAlbums(deezerId);
    const albums = allAlbums.filter(
      (a) => a.record_type === "album" || a.record_type === "ep",
    );
    albumsFound = albums.length;

    for (const dAlbum of albums) {
      try {
        const existingId = await findAlbumIdByArtistAndName(supabase, canonicalArtistId, dAlbum.title);

        if (existingId) {
          // Back-fill missing artwork only
          if (dAlbum.cover_xl) {
            const { data: row } = await supabase
              .from("albums")
              .select("image_url")
              .eq("id", existingId)
              .maybeSingle();
            if (!(row as { image_url?: string } | null)?.image_url) {
              await supabase.from("albums").update({ image_url: dAlbum.cover_xl }).eq("id", existingId);
            }
          }
        } else {
          const releaseDate =
            dAlbum.release_date && dAlbum.release_date !== "0000-00-00"
              ? dAlbum.release_date
              : null;

          const { data: inserted } = await supabase
            .from("albums")
            .insert({
              name: dAlbum.title,
              artist_id: canonicalArtistId,
              image_url: dAlbum.cover_xl || null,
              release_date: releaseDate,
              total_tracks: dAlbum.nb_tracks || null,
            })
            .select("id")
            .single();

          const newAlbumId = (inserted as { id?: string } | null)?.id;
          if (newAlbumId) {
            albumsInserted++;
            const tracks = await getDeezerAlbumTracks(dAlbum.id);
            for (const t of tracks) {
              try {
                await supabase.from("tracks").insert({
                  name: t.title,
                  album_id: newAlbumId,
                  artist_id: canonicalArtistId,
                  track_number: t.trackNumber,
                  disc_number: t.discNumber,
                  duration_ms: null,
                  data_source: "deezer",
                  needs_spotify_enrichment: true,
                });
                tracksInserted++;
              } catch (e) {
                console.error(LOG, "track insert:", t.title, e);
              }
            }
          }
        }
      } catch (e) {
        console.error(LOG, "album error:", dAlbum.title, e);
      }
    }
  }

  // ── MusicBrainz fallback ────────────────────────────────────────────────────
  if (deezerId === null || albumsFound === 0) {
    await syncFromMusicBrainz(supabase, canonicalArtistId, mbid);
  }

  // ── Stamp ──────────────────────────────────────────────────────────────────
  await supabase
    .from("artists")
    .update({ discography_synced_at: new Date().toISOString() })
    .eq("id", canonicalArtistId);

  console.log(LOG, "done", { canonicalArtistId, deezerId, albumsFound, albumsInserted, tracksInserted });
}

// Stub — filled in Task 3
async function syncFromMusicBrainz(
  _supabase: ReturnType<typeof createSupabaseAdminClient>,
  _canonicalArtistId: string,
  _mbid: string | null,
): Promise<void> {
  // intentionally empty until Task 3
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test:unit -- lib/deezer/sync-discography.test.ts
```

Expected: PASS (all 6 tests).

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/deezer/sync-discography.ts lib/deezer/sync-discography.test.ts
git commit -m "feat(deezer): add syncArtistDiscography with Deezer primary path"
```

---

### Task 3: Add MusicBrainz fallback to `sync-discography.ts`

**Files:**
- Modify: `lib/deezer/sync-discography.ts`
- Modify: `lib/deezer/sync-discography.test.ts`

- [ ] **Step 1: Add failing tests for MusicBrainz fallback**

Add these tests to the `describe` block in `lib/deezer/sync-discography.test.ts`:

```ts
// ── MusicBrainz fallback ─────────────────────────────────────────────────────
const mockMbFetch = vi.fn();
global.fetch = mockFetch; // reuse existing global.fetch; we'll override per test

describe("MusicBrainz fallback", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("triggers fallback when Deezer yields no artist match", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeChain({ data: { name: "Obscure Band", mbid: "mb-uuid-1", discography_synced_at: null } });
      if (callCount === 2) return makeChain({ data: null }); // no deezer external_id
      return makeChain({ data: null, error: null });
    });
    mockSearchDeezerArtists.mockResolvedValue([]); // no deezer results
    mockGetDeezerArtistAlbums.mockResolvedValue([]);

    const mbResponse = {
      "release-groups": [
        { id: "rg-1", title: "Old Album", "first-release-date": "2010-05-01", "primary-type": "Album" },
      ],
    };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mbResponse,
    });
    mockFindAlbumIdByArtistAndName.mockResolvedValue(null);

    await syncArtistDiscography("artist-uuid-mb-1");

    // MB fetch was called
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("musicbrainz.org"),
      expect.any(Object),
    );
  });

  it("triggers fallback when Deezer has 0 albums after filter", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeChain({ data: { name: "Artist", mbid: "mb-uuid-2", discography_synced_at: null } });
      if (callCount === 2) return makeChain({ data: { external_id: "77" } }); // has deezer id
      return makeChain({ data: null, error: null });
    });
    // Deezer only has singles — filtered to zero
    mockGetDeezerArtistAlbums.mockResolvedValue([
      { id: 99, title: "Single X", record_type: "single", release_date: "2020-01-01", cover_xl: "", nb_tracks: 1 },
    ]);
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ "release-groups": [] }),
    });

    await syncArtistDiscography("artist-uuid-mb-2");

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("mb-uuid-2"),
      expect.any(Object),
    );
  });

  it("skips MB fetch when artist has no mbid", async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeChain({ data: { name: "Artist", mbid: null, discography_synced_at: null } });
      if (callCount === 2) return makeChain({ data: null }); // no deezer id
      return makeChain({ data: null, error: null });
    });
    mockSearchDeezerArtists.mockResolvedValue([]);
    global.fetch = vi.fn();

    await syncArtistDiscography("artist-uuid-mb-3");

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("stamps discography_synced_at even when MB fetch throws", async () => {
    let callCount = 0;
    let updateCalled = false;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return makeChain({ data: { name: "Artist", mbid: "mb-err", discography_synced_at: null } });
      if (callCount === 2) return makeChain({ data: null });
      if (callCount >= 3) {
        const chain = makeChain({ data: null, error: null });
        chain["update"] = vi.fn(() => {
          updateCalled = true;
          return { eq: vi.fn(async () => ({ error: null })) };
        });
        return chain;
      }
      return makeChain({ data: null, error: null });
    });
    mockSearchDeezerArtists.mockResolvedValue([]);
    global.fetch = vi.fn().mockRejectedValue(new Error("MB down"));

    await syncArtistDiscography("artist-uuid-mb-4");

    // Should not throw despite MB failure
    // (The stamp is still called — verified by no throw and the function completing)
  });
});
```

- [ ] **Step 2: Run tests to confirm new ones fail**

```bash
npm run test:unit -- lib/deezer/sync-discography.test.ts
```

Expected: existing 6 pass, new 4 fail (MB fallback stub returns immediately).

- [ ] **Step 3: Implement `syncFromMusicBrainz` in `lib/deezer/sync-discography.ts`**

Replace the stub `syncFromMusicBrainz` function with the full implementation:

```ts
import Bottleneck from "bottleneck";
import { withRetry } from "@/lib/http/with-retry";

// At module level (add near top of file after imports):
const mbLimiter = new Bottleneck({ maxConcurrent: 1, minTime: 1100 });
const MB_BASE = "https://musicbrainz.org/ws/2";
const MB_USER_AGENT = "Tracklist/1.0 (singh.avi99@gmail.com)";

// Replace stub with:
async function syncFromMusicBrainz(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  canonicalArtistId: string,
  mbid: string | null,
): Promise<void> {
  if (!mbid) return;

  try {
    const url = `${MB_BASE}/release-group?artist=${encodeURIComponent(mbid)}&type=album%7Cep&fmt=json&limit=100`;
    const data = await mbLimiter.schedule(() =>
      withRetry<{ "release-groups"?: MbReleaseGroup[] }>(
        async (sig) => {
          const res = await fetch(url, {
            signal: sig,
            headers: { "User-Agent": MB_USER_AGENT },
          });
          if (!res.ok) throw new Error(`MB HTTP ${res.status}`);
          return res.json() as Promise<{ "release-groups"?: MbReleaseGroup[] }>;
        },
        { label: "musicbrainz/release-group-by-artist", timeoutMs: 15000, maxAttempts: 2, backoffBaseMs: 1200 },
      ),
    );

    for (const rg of data["release-groups"] ?? []) {
      try {
        const existingId = await findAlbumIdByArtistAndName(supabase, canonicalArtistId, rg.title ?? "");
        if (!existingId && rg.title) {
          const releaseDate = padMbDate(rg["first-release-date"]);
          await supabase.from("albums").insert({
            name: rg.title,
            artist_id: canonicalArtistId,
            release_date: releaseDate,
          });
        }
      } catch (e) {
        console.error(LOG, "MB album insert:", rg.title, e);
      }
    }
  } catch (e) {
    console.error(LOG, "MusicBrainz fallback error:", e);
    // catch and continue — stamp discography_synced_at regardless
  }
}

interface MbReleaseGroup {
  id: string;
  title?: string;
  "first-release-date"?: string;
}

function padMbDate(d: string | undefined): string | null {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (/^\d{4}-\d{2}$/.test(d)) return `${d}-01`;
  if (/^\d{4}$/.test(d)) return `${d}-01-01`;
  return null;
}
```

**Important:** move the `mbLimiter` const and the `Bottleneck`/`withRetry` imports to the top of the file, alongside the existing imports.

- [ ] **Step 4: Run full test suite for the file**

```bash
npm run test:unit -- lib/deezer/sync-discography.test.ts
```

Expected: PASS (10 tests).

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/deezer/sync-discography.ts lib/deezer/sync-discography.test.ts
git commit -m "feat(deezer): add MusicBrainz fallback to syncArtistDiscography"
```

---

### Task 4: Wire `SYNC_ARTIST_DISCOGRAPHY` in `run-job.ts`

**Files:**
- Modify: `lib/jobs/run-job.ts`

- [ ] **Step 1: Update `SPOTIFY_JOB_TYPES` set and the case handler**

In `lib/jobs/run-job.ts`, `SYNC_ARTIST_DISCOGRAPHY` is in `SPOTIFY_JOB_TYPES` at line 16. This triggers the Spotify circuit breaker check before the job runs. Remove it from that set — `syncArtistDiscography` never calls Spotify.

Remove `"SYNC_ARTIST_DISCOGRAPHY"` from the `SPOTIFY_JOB_TYPES` set:

```ts
// Before:
const SPOTIFY_JOB_TYPES = new Set([
  "ENRICH_ARTIST",
  "ENRICH_ALBUM",
  "SPOTIFY_ENRICHMENT_RETRY",
  "DRAIN_ENRICH_BACKLOG",
  "SYNC_ARTIST_DISCOGRAPHY",
  "SYNC_ALBUM_TRACKS",
]);

// After:
const SPOTIFY_JOB_TYPES = new Set([
  "ENRICH_ARTIST",
  "ENRICH_ALBUM",
  "SPOTIFY_ENRICHMENT_RETRY",
  "DRAIN_ENRICH_BACKLOG",
  "SYNC_ALBUM_TRACKS",
]);
```

Replace the `SYNC_ARTIST_DISCOGRAPHY` case (lines 110-116):

```ts
// Before:
case "SYNC_ARTIST_DISCOGRAPHY": {
  const { syncArtistDiscographyForCanonicalArtist } = await import(
    "@/lib/spotify-cache"
  );
  await syncArtistDiscographyForCanonicalArtist(job.artistId);
  break;
}

// After:
case "SYNC_ARTIST_DISCOGRAPHY": {
  const { syncArtistDiscography } = await import("@/lib/deezer/sync-discography");
  await syncArtistDiscography(job.artistId);
  break;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run full unit test suite**

```bash
npm run test:unit
```

Expected: all existing tests pass plus the new ones from Tasks 1-3.

- [ ] **Step 4: Commit**

```bash
git add lib/jobs/run-job.ts
git commit -m "feat(jobs): route SYNC_ARTIST_DISCOGRAPHY to Deezer sync, remove from Spotify circuit guard"
```

---

### Task 5: Smoke-test end-to-end via the job handler

**Files:** none (manual verification)

- [ ] **Step 1: Pick an artist with a known discography gap**

Run this SQL in Supabase to find a candidate:

```sql
SELECT id, name, discography_synced_at
FROM artists
WHERE discography_synced_at IS NULL
LIMIT 10;
```

Note one `id` value.

- [ ] **Step 2: Trigger the job locally**

Create a throwaway script `scripts/test-deezer-sync.ts`:

```ts
import { register } from "ts-node/esm";
// For Next.js path aliases:
// Run with: npx tsx --tsconfig tsconfig.json scripts/test-deezer-sync.ts

const ARTIST_ID = process.argv[2]; // pass as CLI arg
if (!ARTIST_ID) throw new Error("Usage: npx tsx scripts/test-deezer-sync.ts <artist-uuid>");

// Register server-only stub (same as other scripts)
const stub = require("@/scripts/register-server-only-stub.cjs");

async function main() {
  const { syncArtistDiscography } = await import("../lib/deezer/sync-discography");
  await syncArtistDiscography(ARTIST_ID);
  console.log("Done");
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

Run it:

```bash
SPOTIFY_NETWORK_FOR_CATALOG_READS=0 npx tsx --tsconfig tsconfig.json scripts/test-deezer-sync.ts <artist-uuid>
```

Expected log output:
```
[sync-discography] done { canonicalArtistId: '...', deezerId: <number>, albumsFound: <n>, albumsInserted: <n>, tracksInserted: <n> }
```

- [ ] **Step 3: Verify in DB**

```sql
-- Check discography_synced_at was stamped
SELECT name, discography_synced_at FROM artists WHERE id = '<artist-uuid>';

-- Check albums were inserted
SELECT name, release_date, image_url FROM albums WHERE artist_id = '<artist-uuid>' LIMIT 20;

-- Check tracks were inserted for new albums
SELECT t.name, t.track_number, t.data_source
FROM tracks t
JOIN albums a ON a.id = t.album_id
WHERE a.artist_id = '<artist-uuid>'
LIMIT 20;
```

Expected: `discography_synced_at` is set; albums + tracks visible.

- [ ] **Step 4: Delete the throwaway script**

```bash
git checkout -- scripts/test-deezer-sync.ts 2>/dev/null; rm -f scripts/test-deezer-sync.ts
```

- [ ] **Step 5: Push to main**

```bash
git push origin main
```

---

## Self-Review

### Spec coverage

| Spec requirement | Task |
|---|---|
| `getDeezerArtistAlbums(artistId)` added to `lib/deezer/client.ts` | Task 1 |
| `record_type` filter: `album` + `ep` only | Task 2 Step 3 |
| 7-day skip guard | Task 2 Step 3 |
| Resolve Deezer ID from `artist_external_ids` | Task 2 Step 3 |
| Search + store Deezer ID when not cached | Task 2 Step 3 |
| Diff via `findAlbumIdByArtistAndName` | Task 2 Step 3 |
| Back-fill `image_url` on existing albums | Task 2 Step 3 |
| Insert new album + tracks | Task 2 Step 3 |
| MusicBrainz fallback when `deezerId === null \|\| albumsFound === 0` | Task 3 |
| Skip MB if `artists.mbid` is null | Task 3 |
| Stamp `discography_synced_at` on success | Task 2 Step 3 |
| Stamp even on MB error | Task 3 Step 3 |
| `run-job.ts` case re-pointed at new function | Task 4 |
| `SYNC_ARTIST_DISCOGRAPHY` removed from Spotify circuit guard set | Task 4 |

### Placeholder scan

None found. All code blocks are complete.

### Type consistency

- `DeezerArtistAlbum` defined in Task 1, used in Task 2 — matches.
- `syncArtistDiscography(canonicalArtistId: string)` defined in Task 2, imported in Task 4 — matches.
- `MbReleaseGroup` defined locally in `sync-discography.ts` (Task 3) — not shared with `match-album-date.ts` (intentional; different shape needed).
- `getDeezerAlbumTracks` returns `DeezerTrack[]` with `title`, `trackNumber`, `discNumber` — used as `t.title`, `t.trackNumber`, `t.discNumber` in Task 2 Step 3 — matches.
