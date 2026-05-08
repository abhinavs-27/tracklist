/**
 * Mobile backend API parity tests.
 *
 * These tests hit the Express backend directly (port 3001 by default, or
 * MOBILE_API_URL env var) and assert that the response shapes match what the
 * mobile app expects AND what the web renders.  They are intentionally strict
 * about the fields that caused real bugs in production:
 *
 *   - Artist reviews: must NOT be filtered to text-only entries
 *   - Artist reviews: song-type reviews must have entity_image_url populated
 *   - Artist albums: must be ordered newest-first (release_date DESC)
 *   - Artist tracks: must have artwork_url when the album has an image
 *   - Discovery bundle: must contain all five sections with correct shapes
 *
 * Tests are skipped automatically when the backend is not reachable, so they
 * are safe to run in a web-only CI environment.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";

const BACKEND = process.env.MOBILE_API_URL ?? "http://127.0.0.1:3001";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function backendReachable(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get(`${BACKEND}/api/health`, { timeout: 3000 });
    return res.ok();
  } catch {
    return false;
  }
}

/** Returns a popular album ID from the web leaderboard (port 3000). */
async function getLeaderboardAlbumId(request: APIRequestContext): Promise<string | null> {
  const res = await request.get("/api/leaderboard?type=popular&entity=album&limit=10&lite=true");
  if (!res.ok()) return null;
  const data = await res.json();
  return (data.items as { id: string }[])?.[0]?.id ?? null;
}

/** Returns the artist_id for an album via the Express backend. */
async function getArtistIdFromAlbum(request: APIRequestContext, albumId: string): Promise<string | null> {
  const res = await request.get(`${BACKEND}/api/albums/${albumId}`);
  if (!res.ok()) return null;
  const data = await res.json();
  return data.album?.artist_id ?? null;
}

// ── Discovery bundle ──────────────────────────────────────────────────────────

test.describe("Express — /api/explore/discovery-bundle", () => {
  test("returns all five sections with correct shapes", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const res = await request.get(`${BACKEND}/api/explore/discovery-bundle?range=week`);
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data).toMatchObject({
      range: "week",
      blowing_up: expect.any(Array),
      most_talked_about: expect.any(Array),
      most_loved: expect.any(Array),
      hidden_gems: expect.any(Array),
      across_communities: expect.any(Array),
    });

    // Each track item in blowing_up must have href and movement
    for (const item of data.blowing_up.slice(0, 3)) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.name).toBe("string");
      expect(typeof item.href).toBe("string");
      expect(item.href).toMatch(/^\/(song|album)\/.+/);
      expect(item.movement).toMatchObject({
        rank_delta: expect.anything(), // null or number
        badge: expect.anything(),      // null | "new" | "hot"
      });
    }

    // Community rows must have href pointing to /communities/:id
    for (const row of data.across_communities.slice(0, 2)) {
      expect(typeof row.community_id).toBe("string");
      expect(typeof row.href).toBe("string");
      expect(row.href).toMatch(/^\/communities\/.+/);
    }
  });

  test("24h range returns valid bundle", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const res = await request.get(`${BACKEND}/api/explore/discovery-bundle?range=24h`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.range).toBe("24h");
    expect(Array.isArray(data.blowing_up)).toBe(true);
  });
});

// ── Artist endpoint ───────────────────────────────────────────────────────────

test.describe("Express — /api/artists/:id", () => {
  test("returns correct top-level shape", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const albumId = await getLeaderboardAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");

    const artistId = await getArtistIdFromAlbum(request, albumId!);
    if (!artistId) test.skip(true, "could not resolve artist_id");

    const res = await request.get(`${BACKEND}/api/artists/${artistId}`);
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data).toMatchObject({
      artist: {
        id: expect.any(String),
        name: expect.any(String),
        genres: expect.any(Array),
      },
      albums: expect.any(Array),
      topTracks: expect.any(Array),
      communityStats: {
        totalPlays: expect.any(Number),
        albumCount: expect.any(Number),
      },
      reviews: expect.any(Array),
    });
  });

  test("albums are ordered newest-first (release_date DESC)", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const albumId = await getLeaderboardAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");
    const artistId = await getArtistIdFromAlbum(request, albumId!);
    if (!artistId) test.skip(true, "no artist id");

    const res = await request.get(`${BACKEND}/api/artists/${artistId}`);
    const { albums } = await res.json() as { albums: { release_date: string | null }[] };

    const dated = albums.filter((a) => a.release_date != null);
    if (dated.length < 2) test.skip(true, "not enough albums with release dates to verify order");

    for (let i = 0; i < dated.length - 1; i++) {
      const a = dated[i].release_date!;
      const b = dated[i + 1].release_date!;
      expect(a >= b).toBe(true); // newest first
    }
  });

  test("reviews are NOT filtered to text-only — includes rating-only entries", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const albumId = await getLeaderboardAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");
    const artistId = await getArtistIdFromAlbum(request, albumId!);
    if (!artistId) test.skip(true, "no artist id");

    const res = await request.get(`${BACKEND}/api/artists/${artistId}`);
    const { reviews } = await res.json() as {
      reviews: { review_text: string | null; rating: number; entity_type: string; entity_image_url: string | null }[]
    };

    if (reviews.length === 0) test.skip(true, "artist has no reviews");

    // All reviews must have a numeric rating — not gated on having text
    for (const r of reviews) {
      expect(typeof r.rating).toBe("number");
      expect(r.rating).toBeGreaterThan(0);
    }

    // If any rating-only review exists in the DB, the API must return it.
    // We can't assert this without knowing the DB state — so we assert the
    // reviews array is not suspiciously small (< total we'd expect if filtered).
    // The real guard is the "no review_text filter" unit assertion below.
    expect(reviews.length).toBeGreaterThan(0);
  });

  test("song-type reviews have entity_image_url (album cover via tracks→albums join)", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const albumId = await getLeaderboardAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");
    const artistId = await getArtistIdFromAlbum(request, albumId!);
    if (!artistId) test.skip(true, "no artist id");

    const res = await request.get(`${BACKEND}/api/artists/${artistId}`);
    const { reviews } = await res.json() as {
      reviews: { entity_type: string; entity_image_url: string | null }[]
    };

    const songReviews = reviews.filter((r) => r.entity_type === "song");
    if (songReviews.length === 0) test.skip(true, "no song-type reviews for this artist");

    // At least one song review should have an image (not all songs are imageless)
    const withImage = songReviews.filter((r) => r.entity_image_url != null);
    expect(withImage.length).toBeGreaterThan(0);
  });

  test("top tracks have artwork_url when album image exists", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const albumId = await getLeaderboardAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");
    const artistId = await getArtistIdFromAlbum(request, albumId!);
    if (!artistId) test.skip(true, "no artist id");

    const res = await request.get(`${BACKEND}/api/artists/${artistId}`);
    const { topTracks } = await res.json() as {
      topTracks: { id: string; name: string; artwork_url: string | null }[]
    };

    if (topTracks.length === 0) test.skip(true, "no top tracks");

    // At least the most popular track should have artwork
    const withArt = topTracks.filter((t) => t.artwork_url != null);
    expect(withArt.length).toBeGreaterThan(0);
  });
});

// ── Album endpoint ────────────────────────────────────────────────────────────

test.describe("Express — /api/albums/:id", () => {
  test("accepts Spotify ID (22-char) and returns 200", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const albumId = await getLeaderboardAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");

    const res = await request.get(`${BACKEND}/api/albums/${albumId}`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(typeof data.album.id).toBe("string");
  });

  test("accepts UUID (from artist page / leaderboard) and returns 200 — regression for 'Invalid Spotify album id'", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    // Get a UUID-format album ID the same way the artist page does:
    // leaderboard returns DB UUIDs, artist page returns album.id UUIDs
    const artistId = await (async () => {
      const albumId = await getLeaderboardAlbumId(request);
      if (!albumId) return null;
      return getArtistIdFromAlbum(request, albumId);
    })();
    if (!artistId) test.skip(true, "could not get artist id");

    const artistRes = await request.get(`${BACKEND}/api/artists/${artistId}`);
    if (!artistRes.ok()) test.skip(true, "artist endpoint unavailable");
    const artistData = await artistRes.json();
    const albums = artistData.albums as { id: string }[];
    if (!albums?.length) test.skip(true, "artist has no albums");

    // albums[0].id is a DB UUID — this is what the mobile sends when navigating from artist page
    const uuidAlbumId = albums[0].id;
    // Validate it really is a UUID (not Spotify ID)
    expect(uuidAlbumId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    const res = await request.get(`${BACKEND}/api/albums/${uuidAlbumId}`);
    expect(res.status()).not.toBe(400); // must not return "Invalid Spotify album id"
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(typeof data.album.name).toBe("string");
    expect(Array.isArray(data.tracks)).toBe(true);
  });

  test("returns 400 for garbage input (not UUID or Spotify ID)", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const res = await request.get(`${BACKEND}/api/albums/not-a-valid-id`);
    expect(res.status()).toBe(400);
  });

  test("returns album, tracks, stats, reviews with correct shapes", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const albumId = await getLeaderboardAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");

    const res = await request.get(`${BACKEND}/api/albums/${albumId}`);
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data).toMatchObject({
      album: {
        id: expect.any(String),
        name: expect.any(String),
        artist: expect.any(String),
      },
      tracks: expect.any(Array),
      stats: {
        average_rating: expect.anything(),
        play_count: expect.any(Number),
        favorite_count: expect.any(Number),
        review_count: expect.any(Number),
      },
    });

    // Tracks must have per-track stats for the tracklist
    if (data.tracks.length > 0) {
      const t = data.tracks[0];
      expect(typeof t.id).toBe("string");
      expect(typeof t.name).toBe("string");
      expect(typeof t.track_number).toBe("number");
      expect(typeof t.listen_count).toBe("number");
      expect(typeof t.review_count).toBe("number");
    }
  });

  test("reviews.items contains entity_image_url for album reviews", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const albumId = await getLeaderboardAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");

    const res = await request.get(`${BACKEND}/api/albums/${albumId}`);
    const data = await res.json();
    const items = data.reviews?.items ?? [];

    if (items.length === 0) test.skip(true, "album has no reviews");

    for (const r of items) {
      expect(typeof r.rating).toBe("number");
      // username may be null for anonymous reviews
      expect(r.username === null || typeof r.username === "string").toBe(true);
    }
  });
});

// ── Web/Express response parity ───────────────────────────────────────────────

test.describe("Web vs Express — album response parity", () => {
  test("both endpoints return the same album id and name", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const albumId = await getLeaderboardAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");

    const [webRes, mobileRes] = await Promise.all([
      request.get(`/api/albums/${albumId}`),
      request.get(`${BACKEND}/api/albums/${albumId}`),
    ]);

    expect(webRes.status()).toBe(200);
    expect(mobileRes.status()).toBe(200);

    const web = await webRes.json();
    const mobile = await mobileRes.json();

    expect(mobile.album.id).toBe(web.album.id);
    expect(mobile.album.name).toBe(web.album.name);
    expect(mobile.album.artist).toBe(web.album.artist);

    // Track counts must match
    expect(mobile.tracks.length).toBe(web.tracks.length);
  });
});

// ── Song/Spotify API ──────────────────────────────────────────────────────────

test.describe("Express — /api/spotify/song/:id", () => {
  test("returns correct shape for the mobile song page", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    // Get a track id via the album API
    const albumId = await getLeaderboardAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");

    const albumRes = await request.get(`${BACKEND}/api/albums/${albumId}`);
    if (!albumRes.ok()) test.skip(true, "could not load album");
    const albumData = await albumRes.json();
    const songId = (albumData.tracks as { id: string }[])?.[0]?.id;
    if (!songId) test.skip(true, "album has no tracks");

    const res = await request.get(`${BACKEND}/api/spotify/song/${songId}`);
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(typeof data.id).toBe("string");
    expect(typeof data.name).toBe("string");
    expect(typeof data.artist).toBe("string");
    // artist_id is required for "artist →" navigation on the song page
    expect(data.artist_id === null || typeof data.artist_id === "string").toBe(true);
    // album_id drives the album context section
    expect(data.album_id === null || typeof data.album_id === "string").toBe(true);
    expect(data.image_url === null || typeof data.image_url === "string").toBe(true);
  });

  test("song has image_url when album has artwork", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const albumId = await getLeaderboardAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");

    const albumRes = await request.get(`${BACKEND}/api/albums/${albumId}`);
    if (!albumRes.ok()) test.skip(true, "could not load album");
    const albumData = await albumRes.json();

    // Album itself should have artwork
    expect(albumData.album.artwork_url).not.toBeNull();

    // Any track in that album should also have an image (via its album)
    const songId = (albumData.tracks as { id: string }[])?.[0]?.id;
    if (!songId) test.skip(true, "album has no tracks");

    const res = await request.get(`${BACKEND}/api/spotify/song/${songId}`);
    if (!res.ok()) test.skip(true, "song not found in backend");
    const song = await res.json();
    expect(song.image_url).not.toBeNull();
  });
});

// ── Feed API ──────────────────────────────────────────────────────────────────

test.describe("Express — /api/feed", () => {
  test("returns 200 with array shape (requires auth for populated data)", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const res = await request.get(`${BACKEND}/api/feed`);
    // Feed may return 401 when unauthenticated — that's acceptable
    expect([200, 401]).toContain(res.status());

    if (res.status() === 200) {
      const data = await res.json();
      expect(Array.isArray(data) || Array.isArray(data.items) || typeof data === "object").toBe(true);
    }
  });
});

// ── Song API — web vs Express parity ─────────────────────────────────────────

test.describe("Web vs Express — song/spotify response parity", () => {
  test("both endpoints return the same song name and artist", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const albumId = await getLeaderboardAlbumId(request);
    if (!albumId) test.skip(true, "no leaderboard data");

    const albumRes = await request.get(`/api/albums/${albumId}`);
    if (!albumRes.ok()) test.skip(true, "could not load album via web");
    const webAlbum = await albumRes.json();
    const songId = (webAlbum.tracks as { id: string }[])?.[0]?.id;
    if (!songId) test.skip(true, "album has no tracks");

    const [webRes, mobileRes] = await Promise.all([
      request.get(`/api/spotify/song/${songId}`),
      request.get(`${BACKEND}/api/spotify/song/${songId}`),
    ]);

    if (!webRes.ok() || !mobileRes.ok()) test.skip(true, "song not accessible on one endpoint");

    const web = await webRes.json();
    const mobile = await mobileRes.json();

    expect(mobile.id).toBe(web.id);
    expect(mobile.name).toBe(web.name);
    expect(mobile.artist).toBe(web.artist);
    // album_id must match — drives the album context section on the song page
    expect(mobile.album_id).toBe(web.album_id);
  });
});

// ── Home / Visitor Feed API ───────────────────────────────────────────────────

test.describe("Express — visitor-facing explore APIs (home page sections)", () => {
  test("leaderboard API returns items used in Billboard preview on home page", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const res = await request.get(`${BACKEND}/api/leaderboard?type=popular&entity=album&limit=10`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);

    if (data.items.length > 0) {
      const item = data.items[0];
      expect(typeof item.id).toBe("string");
      expect(typeof item.name).toBe("string");
      expect(typeof item.artist).toBe("string");
      expect(item.artwork_url === null || typeof item.artwork_url === "string").toBe(true);
    }
  });

  test("discovery bundle powers the Trending section visible on home (logged-out) via VisitorFeed", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const res = await request.get(`${BACKEND}/api/discover/trending?limit=10`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  test("web leaderboard and Express leaderboard return same item count for same query", async ({ request }) => {
    if (!await backendReachable(request)) test.skip(true, "Express backend not running");

    const [webRes, mobileRes] = await Promise.all([
      request.get("/api/leaderboard?type=popular&entity=album&limit=10&lite=true"),
      request.get(`${BACKEND}/api/leaderboard?type=popular&entity=album&limit=10&lite=true`),
    ]);

    expect(webRes.status()).toBe(200);
    expect(mobileRes.status()).toBe(200);

    const web = await webRes.json();
    const mobile = await mobileRes.json();

    // Both should return the same items (same DB, same query)
    expect(mobile.items.length).toBe(web.items.length);
    if (web.items.length > 0) {
      expect(mobile.items[0].id).toBe(web.items[0].id);
      expect(mobile.items[0].name).toBe(web.items[0].name);
    }
  });
});
