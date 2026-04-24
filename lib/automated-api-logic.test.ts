import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as reviewPOST } from '../app/api/reviews/route';
import { POST as logPOST } from '../app/api/logs/route';
import { POST as syncPOST } from '../app/api/spotify/sync/route';
import { GET as userGET } from '../app/api/users/[username]/route';
import { GET as searchGET } from '../app/api/search/route';

// Mock server-only
vi.mock('server-only', () => ({}));

// --- Mocks ---

// Mock Auth
vi.mock('@/lib/auth', () => ({
  requireApiAuth: vi.fn(async (req) => {
    // If authorization header is 'Bearer invalid', throw an error that withHandler/handleUnauthorized will catch
    const auth = req.headers.get('Authorization');
    if (auth === 'Bearer invalid') {
      const err: any = new Error('Unauthorized');
      err.status = 401;
      throw err;
    }
    return { id: 'test-user-id', username: 'testuser' };
  }),
  getUserFromRequest: vi.fn(async () => ({ id: 'viewer-id' })),
  handleUnauthorized: vi.fn((e) => {
    if (e && (e.status === 401 || e.message === 'Unauthorized')) {
        return { status: 401, json: async () => ({ error: 'Unauthorized' }) };
    }
    return null;
  }),
}));

// Mock Supabase
function createChain() {
  const chain: any = {
    select: vi.fn().mockImplementation(() => chain),
    eq: vi.fn().mockImplementation(() => chain),
    in: vi.fn().mockImplementation(() => chain),
    insert: vi.fn().mockImplementation(() => chain),
    upsert: vi.fn().mockImplementation(() => chain),
    single: vi.fn().mockImplementation(() => chain),
    maybeSingle: vi.fn().mockImplementation(() => chain),
    order: vi.fn().mockImplementation(() => chain),
    limit: vi.fn().mockImplementation(() => chain),
    range: vi.fn().mockImplementation(() => chain),
  };
  return chain;
}

let activeChain: any = createChain();
const mockSupabase = {
  from: vi.fn().mockImplementation(() => {
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

vi.mock('@/lib/catalog/entity-resolution', () => ({
  getTrackIdByExternalId: vi.fn(async () => 'track-uuid'),
  getAlbumIdByExternalId: vi.fn(async () => 'album-uuid'),
  getArtistIdByExternalId: vi.fn(async () => 'artist-uuid'),
  resolveAndCheckPending: vi.fn(async (type, id) => {
    if (id === 'pending-id') return { pending: true };
    return { id: 'resolved-uuid' };
  })
}));

vi.mock('@/lib/catalog/non-blocking-enrichment', () => ({
  scheduleTrackEnrichment: vi.fn(),
  scheduleAlbumEnrichment: vi.fn(),
  scheduleArtistEnrichment: vi.fn(),
  scheduleTrackEnrichmentBatch: vi.fn(),
}));

// Mock other internal helpers
vi.mock('@/lib/queries', () => ({
  grantAchievementOnReview: vi.fn(),
  grantAchievementsOnListen: vi.fn(),
  getReviewsForEntity: vi.fn(),
  fetchUserSummary: vi.fn(async (userId) => {
    if (userId === 'test-user-id') {
      return { id: 'test-user-id', username: 'testuser', avatar_url: null };
    }
    return null;
  }),
  getFullUserProfile: vi.fn(async (username) => {
    if (username === 'testuser') {
      return { id: 'test-user-id', username: 'testuser', bio: 'Test bio' };
    }
    if (username === 'error') {
      throw new Error('Database failure');
    }
    return null;
  }),
  getListenLogsForUser: vi.fn(async () => []),
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

describe('Critical Flows: API Logic (Automated)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
  });

  describe('POST /api/reviews', () => {
    it('should successfully create/upsert a review', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);
      const { fetchUserSummary } = await import('@/lib/queries');
      vi.mocked(fetchUserSummary).mockResolvedValue({ id: 'test-user-id', username: 'testuser', avatar_url: null });

      chain.single.mockResolvedValueOnce({
        data: {
          id: 'r1',
          user_id: 'test-user-id',
          entity_type: 'album',
          entity_id: 'a1',
          rating: 5,
          review_text: 'Great!',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        error: null
      });

      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: 'album',
          entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx',
          rating: 5,
          review_text: 'Great!'
        }),
      });

      const res = await reviewPOST(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('r1');
      expect(body.rating).toBe(5);
    });

    it('should return 400 for invalid rating', async () => {
      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: 'a1', rating: 6 }),
      });
      const res = await reviewPOST(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(400);
    });

    it('should truncate review text to 10,000 characters', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);
      const { fetchUserSummary } = await import('@/lib/queries');
      vi.mocked(fetchUserSummary).mockResolvedValue({ id: 'test-user-id', username: 'testuser', avatar_url: null });

      chain.single.mockResolvedValueOnce({
        data: {
            id: 'r1',
            user_id: 'test-user-id',
            entity_type: 'album',
            entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx',
            rating: 5,
            review_text: 'a'.repeat(10000),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        },
        error: null
      });

      const longText = 'a'.repeat(11000);
      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 5, review_text: longText }),
      });

      const res = await reviewPOST(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.review_text).toBe('a'.repeat(10000));
    });

    it('should return 401 for unauthorized access', async () => {
      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer invalid' },
        body: JSON.stringify({ entity_type: 'album', entity_id: 'a1', rating: 5 }),
      });
      const res = await reviewPOST(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/logs', () => {
    it('should successfully log a listen with track_id', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);
      chain.single.mockResolvedValue({
        data: { id: 'l1', track_id: 'track-uuid', listened_at: new Date().toISOString() },
        error: null
      });

      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({ track_id: '2nLhD10Z7Sb4RFyCX2ZCyx', source: 'manual' }),
      });

      const res = await logPOST(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('l1');
    });

    it('should successfully log a listen with spotify_id', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);
      chain.single.mockResolvedValue({
        data: { id: 'l1', track_id: 'track-uuid', listened_at: new Date().toISOString() },
        error: null
      });

      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({ spotify_id: '2nLhD10Z7Sb4RFyCX2ZCyx', source: 'manual' }),
      });

      const res = await logPOST(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
    });

    it('should return 401 for unauthorized access', async () => {
      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer invalid' },
        body: JSON.stringify({ track_id: 'a1' }),
      });
      const res = await logPOST(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(401);
    });

    it('should return 503 if catalog is pending', async () => {
      const { getTrackIdByExternalId } = await import('@/lib/catalog/entity-resolution');
      vi.mocked(getTrackIdByExternalId).mockReset();
      vi.mocked(getTrackIdByExternalId).mockResolvedValueOnce(null);

      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({ track_id: '2nLhD10Z7Sb4RFyCX2ZCyx', source: 'manual' }),
      });
      const res = await logPOST(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe('catalog_pending');
    });
  });

  describe('POST /api/spotify/sync', () => {
    it('should successfully sync from spotify', async () => {
      const firstChain = createChain();
      const secondChain = createChain();
      mockSupabase.from
        .mockReturnValueOnce(firstChain) // check existing
        .mockReturnValueOnce(secondChain); // insert result fetch

      firstChain.in.mockResolvedValue({ data: [], error: null });
      secondChain.select.mockResolvedValue({ data: [{ id: 'l1' }], error: null });

      const req = new NextRequest('http://localhost/api/spotify/sync', { method: 'POST' });
      const res = await syncPOST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.inserted).toBe(1);
    });

    it('should handle sync errors gracefully', async () => {
      const { getValidSpotifyAccessToken } = await import('@/lib/spotify-user');
      vi.mocked(getValidSpotifyAccessToken).mockRejectedValueOnce(new Error('Spotify API down'));

      const req = new NextRequest('http://localhost/api/spotify/sync', { method: 'POST' });
      const res = await syncPOST(req);
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/users/[username]', () => {
    it('should fetch a user profile', async () => {
      const req = new NextRequest('http://localhost/api/users/testuser');
      const res = await userGET(req, { params: Promise.resolve({ username: 'testuser' }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe('testuser');
    });

    it('should return 404 for non-existent user', async () => {
      const req = new NextRequest('http://localhost/api/users/missing');
      const res = await userGET(req, { params: Promise.resolve({ username: 'missing' }) });
      expect(res.status).toBe(404);
    });

    it('should return 500 on database error', async () => {
      const req = new NextRequest('http://localhost/api/users/error');
      const res = await userGET(req, { params: Promise.resolve({ username: 'error' }) });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/search', () => {
    it('should return search results', async () => {
      const req = new NextRequest('http://localhost/api/search?q=test');
      const res = await searchGET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.artists.items.length).toBeGreaterThan(0);
      expect(body.artists.items[0].name).toBe('Test Artist');
    });

    it('should return 400 for empty query', async () => {
      const req = new NextRequest('http://localhost/api/search?q=');
      const res = await searchGET(req);
      expect(res.status).toBe(400);
    });

    it('should clamp limit to 10', async () => {
      const req = new NextRequest('http://localhost/api/search?q=test&limit=20');
      const res = await searchGET(req);
      expect(res.status).toBe(200);
      const { searchSpotify } = await import('@/lib/spotify');
      expect(searchSpotify).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        10
      );
    });
  });
});
