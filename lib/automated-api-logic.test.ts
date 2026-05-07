import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { POST as reviewPOST } from '../app/api/reviews/route';
import { POST as logPOST } from '../app/api/logs/route';
import { POST as syncPOST } from '../app/api/spotify/sync/route';
import { GET as userGET } from '../app/api/users/[username]/route';
import { GET as searchGET } from '../app/api/search/route';

// --- Constants for testing ---
const MOCK_USER_ID = '789e4567-e89b-12d3-a456-426614174000';
const MOCK_TRACK_UUID = '123e4567-e89b-12d3-a456-426614174001';
const MOCK_ALBUM_UUID = '123e4567-e89b-12d3-a456-426614174002';
const MOCK_SPOTIFY_ID = '2nLhD10Z7Sb4RFyCX2ZCyx'; // 22 chars

// --- Mocks ---

vi.mock('@/lib/auth', () => ({
  requireApiAuth: vi.fn(async () => ({ id: MOCK_USER_ID, username: 'testuser' })),
  getUserFromRequest: vi.fn(async () => ({ id: MOCK_USER_ID })),
  handleUnauthorized: vi.fn(() => null),
}));

// Mock Supabase
function createChain(initialResult: any = { data: null, error: null }) {
  const chain: any = {
    select: vi.fn().mockImplementation(() => chain),
    eq: vi.fn().mockImplementation(() => chain),
    in: vi.fn().mockImplementation(() => chain),
    insert: vi.fn().mockImplementation(() => chain),
    upsert: vi.fn().mockImplementation(() => chain),
    single: vi.fn().mockImplementation(() => Promise.resolve(initialResult)),
    maybeSingle: vi.fn().mockImplementation(() => Promise.resolve(initialResult)),
    order: vi.fn().mockImplementation(() => chain),
    limit: vi.fn().mockImplementation(() => chain),
    range: vi.fn().mockImplementation(() => chain),
    rpc: vi.fn().mockImplementation(() => chain),
    then: (onfulfilled: any) => Promise.resolve(initialResult).then(onfulfilled),
  };
  return chain;
}

let activeChain: any;
const mockSupabase = {
  from: vi.fn(() => {
    activeChain = createChain();
    return activeChain;
  }),
  rpc: vi.fn(() => {
    activeChain = createChain();
    return activeChain;
  }),
};

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(async () => mockSupabase),
}));

// Mock Spotify
vi.mock('@/lib/spotify', () => ({
  searchSpotify: vi.fn(async (q) => {
    if (q === 'noresults') {
        return { artists: { items: [] }, albums: { items: [] }, tracks: { items: [] } };
    }
    return {
      artists: { items: [{ id: 'a1', name: 'Test Artist' }] },
      albums: { items: [] },
      tracks: { items: [] },
    };
  }),
}));

vi.mock('@/lib/spotify-cache', () => ({
  getOrFetchTrack: vi.fn(),
  getOrFetchAlbum: vi.fn(),
  getOrFetchArtist: vi.fn(),
  getOrFetchTracksBatch: vi.fn(async () => []),
}));

vi.mock('@/lib/catalog/entity-resolution', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/catalog/entity-resolution')>();
  return {
    ...actual,
    getTrackIdByExternalId: vi.fn(async () => MOCK_TRACK_UUID),
    getAlbumIdByExternalId: vi.fn(async () => MOCK_ALBUM_UUID),
    getArtistIdByExternalId: vi.fn(async () => 'artist-uuid'),
    resolveAndCheckPending: vi.fn(async (supabase, rawId, kind) => {
      if (!rawId) return null;
      if (rawId === 'pendingpendingpendingpe') return { kind: 'pending', spotifyId: rawId, entity: kind };
      return { kind: 'resolved', id: MOCK_TRACK_UUID };
    }),
  };
});

vi.mock('@/lib/catalog/non-blocking-enrichment', () => ({
  scheduleTrackEnrichment: vi.fn(),
  scheduleAlbumEnrichment: vi.fn(),
  scheduleArtistEnrichment: vi.fn(),
  scheduleTrackEnrichmentBatch: vi.fn(),
}));

// Consolidated mocks for @/lib/queries to avoid TS1117
vi.mock('@/lib/queries', () => ({
  grantAchievementOnReview: vi.fn(),
  grantAchievementsOnListen: vi.fn(),
  getReviewsForEntity: vi.fn(),
  getFullUserProfile: vi.fn(async (username) => {
    if (username === 'testuser') {
        return { id: MOCK_USER_ID, username: 'testuser', bio: 'Test bio' };
    }
    if (username === 'error') {
        throw new Error('Database failure');
    }
    return null;
  }),
  getListenLogsForUser: vi.fn(async () => []),
  fetchUserSummary: vi.fn(async (userId) => {
    if (userId === MOCK_USER_ID) {
      return { id: MOCK_USER_ID, username: 'testuser', avatar_url: null };
    }
    return null;
  }),
}));

vi.mock('@/lib/feed/generate-events', () => ({
  recordRatingFeedEvent: vi.fn(),
}));

vi.mock('@/lib/community/community-feed-insert', () => ({
  fanOutReviewForUserCommunities: vi.fn(),
  fanOutListenForUserCommunities: vi.fn(),
}));

vi.mock('@/lib/sync-manual-log-side-effects', () => ({
  syncManualLogSideEffects: vi.fn(),
}));

vi.mock('@/lib/spotify-user', () => ({
  getValidSpotifyAccessToken: vi.fn(async () => 'mock-token'),
  getRecentlyPlayed: vi.fn(async () => ({
    items: [{ played_at: new Date().toISOString(), track: { id: 's1' } }],
  })),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkSpotifyRateLimit: vi.fn(() => true),
}));

vi.mock('@/lib/spotify-integration-enabled', () => ({
  isSpotifyIntegrationEnabled: vi.fn(() => true),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock('@/lib/taste/enrich-artist-genres', () => ({
  scheduleEnrichArtistGenresForTrackIds: vi.fn(),
}));

vi.mock('@/lib/profile/recent-activity-cache', () => ({
  bustRecentActivityCacheForUser: vi.fn(),
}));

describe('Automated API Logic Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Creating Reviews (POST /api/reviews)', () => {
    it('should successfully create a review with valid UUID and rating', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);
      chain.single.mockResolvedValueOnce({
        data: { id: 'r1', entity_type: 'album', entity_id: MOCK_ALBUM_UUID, rating: 5, created_at: new Date().toISOString() },
        error: null
      });

      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: MOCK_ALBUM_UUID, rating: 5, review_text: 'Great!' }),
      });

      const res = await reviewPOST(req, { user: { id: MOCK_USER_ID } } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('r1');
    });

    it('should successfully create a review with valid Spotify ID', async () => {
        const chain = createChain();
        mockSupabase.from.mockReturnValue(chain);
        chain.single.mockResolvedValueOnce({
          data: { id: 'r2', entity_type: 'album', entity_id: MOCK_ALBUM_UUID, rating: 4.5 },
          error: null
        });

        const req = new NextRequest('http://localhost/api/reviews', {
          method: 'POST',
          body: JSON.stringify({ entity_type: 'album', entity_id: MOCK_SPOTIFY_ID, rating: 4.5 }),
        });

        const res = await reviewPOST(req, { user: { id: MOCK_USER_ID } } as any);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.rating).toBe(4.5);
    });

    it('should fail with 400 for invalid rating (e.g., 6 stars)', async () => {
        const req = new NextRequest('http://localhost/api/reviews', {
          method: 'POST',
          body: JSON.stringify({ entity_type: 'album', entity_id: MOCK_ALBUM_UUID, rating: 6 }),
        });
        const res = await reviewPOST(req, { user: { id: MOCK_USER_ID } } as any);
        expect(res.status).toBe(400);
    });

    it('should fail with 400 for invalid rating (e.g., non-half step)', async () => {
        const req = new NextRequest('http://localhost/api/reviews', {
          method: 'POST',
          body: JSON.stringify({ entity_type: 'album', entity_id: MOCK_ALBUM_UUID, rating: 4.2 }),
        });
        const res = await reviewPOST(req, { user: { id: MOCK_USER_ID } } as any);
        expect(res.status).toBe(400);
    });
  });

  describe('Logging Listens (POST /api/logs)', () => {
    it('should successfully log a listen with valid track UUID', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);
      chain.single.mockResolvedValue({
        data: { id: 'l1', track_id: MOCK_TRACK_UUID, listened_at: new Date().toISOString() },
        error: null
      });

      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({ track_id: MOCK_TRACK_UUID, source: 'manual' }),
      });

      const res = await logPOST(req, { user: { id: MOCK_USER_ID } } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('l1');
    });

    it('should return 503 if track catalog ingestion is pending', async () => {
        const { resolveAndCheckPending } = await import('@/lib/catalog/entity-resolution');
        vi.mocked(resolveAndCheckPending).mockResolvedValueOnce({
          kind: 'pending',
          spotifyId: 'pendingpendingpendingpe',
          entity: 'track'
        });

        const req = new NextRequest('http://localhost/api/logs', {
          method: 'POST',
          body: JSON.stringify({ track_id: 'pendingpendingpendingpe', source: 'manual' }),
        });
        const res = await logPOST(req, { user: { id: MOCK_USER_ID } } as any);
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.code).toBe('catalog_pending');
    });
  });

  describe('Spotify Ingestion (POST /api/spotify/sync)', () => {
    it('should process recently played tracks and return insertion count', async () => {
        // Use multiple chains for different calls
        const checkExistingChain = createChain({ data: [], error: null });
        const insertChain = createChain({ data: [{ id: 'l1', track_id: 's1', listened_at: new Date().toISOString() }], error: null });

        mockSupabase.from
          .mockReturnValueOnce(checkExistingChain) // check existing
          .mockReturnValueOnce(insertChain); // insert

        const req = new NextRequest('http://localhost/api/spotify/sync', { method: 'POST' });
        const res = await syncPOST(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.inserted).toBe(1);
    });
  });

  describe('User Profile Fetch (GET /api/users/[username])', () => {
    it('should return user profile data for valid username', async () => {
      const req = new NextRequest('http://localhost/api/users/testuser');
      const res = await userGET(req, { params: Promise.resolve({ username: 'testuser' }) } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe('testuser');
    });

    it('should return 404 for missing user', async () => {
        const req = new NextRequest('http://localhost/api/users/missinguser');
        const res = await userGET(req, { params: Promise.resolve({ username: 'missinguser' }) } as any);
        expect(res.status).toBe(404);
    });
  });

  describe('Search Results (GET /api/search)', () => {
    it('should return search results for a valid query', async () => {
      const req = new NextRequest('http://localhost/api/search?q=radiohead');
      const res = await searchGET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.artists.items.length).toBeGreaterThan(0);
    });

    it('should return 400 for empty search query', async () => {
        const req = new NextRequest('http://localhost/api/search?q=');
        const res = await searchGET(req);
        expect(res.status).toBe(400);
    });
  });
});
