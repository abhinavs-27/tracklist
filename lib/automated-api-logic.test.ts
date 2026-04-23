import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { POST as reviewPOST } from '../app/api/reviews/route';
import { POST as logPOST } from '../app/api/logs/route';
import { POST as syncPOST } from '../app/api/spotify/sync/route';
import { GET as userGET } from '../app/api/users/[username]/route';
import { GET as searchGET } from '../app/api/search/route';
import { LIMITS } from './validation';

// --- Mocks ---

vi.mock('@/lib/auth', () => ({
  requireApiAuth: vi.fn(async (req) => {
    if (req.headers.get('Authorization') === 'Bearer invalid') {
      throw new Error('Unauthorized');
    }
    return { id: 'test-user-id', username: 'testuser' };
  }),
  getUserFromRequest: vi.fn(async () => ({ id: 'viewer-id' })),
  handleUnauthorized: vi.fn((e) => {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return { status: 401, json: async () => ({ error: 'Unauthorized' }) } as any;
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
    then: vi.fn().mockImplementation((cb) => Promise.resolve(cb({ data: null, error: null }))),
  };
  return chain;
}

const mockSupabase = {
  from: vi.fn(() => createChain()),
};

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(async () => mockSupabase),
}));

// Mock Spotify
vi.mock('@/lib/spotify', () => ({
  searchSpotify: vi.fn(async (q, types, limit) => {
    if (q === 'noresults') {
        return { artists: { items: [] }, albums: { items: [] }, tracks: { items: [] } };
    }
    return {
      artists: { items: Array(limit || 1).fill({ id: 'a1', name: 'Test Artist' }) },
      albums: { items: [] },
      tracks: { items: [] },
    };
  }),
}));

vi.mock('@/lib/catalog/entity-resolution', () => ({
  getTrackIdByExternalId: vi.fn(async (supabase, provider, id) => {
    if (id === '0123456789012345678902') return null;
    return '550e8400-e29b-41d4-a716-446655440000';
  }),
  getAlbumIdByExternalId: vi.fn(async () => 'album-uuid'),
  getArtistIdByExternalId: vi.fn(async () => 'artist-uuid'),
}));

vi.mock('@/lib/catalog/non-blocking-enrichment', () => ({
  scheduleTrackEnrichment: vi.fn(),
  scheduleAlbumEnrichment: vi.fn(),
  scheduleArtistEnrichment: vi.fn(),
  scheduleTrackEnrichmentBatch: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  grantAchievementOnReview: vi.fn(),
  grantAchievementsOnListen: vi.fn(),
  getListenLogsForUser: vi.fn(async () => []),
  getReviewsForEntity: vi.fn(),
  fetchUserSummary: vi.fn(async (userId) => ({ id: userId, username: 'testuser', avatar_url: null })),
  getFullUserProfile: vi.fn(async (username) => {
    if (username === 'testuser') {
        return { id: 'test-user-id', username: 'testuser', bio: 'Test bio' };
    }
    if (username === 'error') {
        throw new Error('Database failure');
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

vi.mock('@/lib/spotify-user', () => ({
  getValidSpotifyAccessToken: vi.fn(async (userId) => {
    if (userId === 'no-spotify') throw new Error('Spotify not connected');
    return 'mock-token';
  }),
  getRecentlyPlayed: vi.fn(async () => ({
    items: [{ played_at: new Date().toISOString(), track: { id: 's1' } }],
  })),
}));

vi.mock('@/lib/spotify-integration-enabled', () => ({
  isSpotifyIntegrationEnabled: vi.fn(() => true),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkSpotifyRateLimit: vi.fn(() => true),
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

vi.mock('@/lib/sync-manual-log-side-effects', () => ({
  syncManualLogSideEffects: vi.fn(),
}));

describe('Automated API Logic: Critical Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Review Creation', () => {
    it('should successfully create a review and truncate text to 10k chars', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);

      const longText = 'a'.repeat(LIMITS.REVIEW_CONTENT + 100);

      chain.single.mockResolvedValueOnce({
        data: {
          id: 'r1',
          entity_type: 'album',
          entity_id: 'a1',
          rating: 5,
          review_text: longText.slice(0, LIMITS.REVIEW_CONTENT),
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
          review_text: longText
        }),
      });

      const res = await reviewPOST(req, { user: { id: 'test-user-id' } } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.review_text.length).toBe(LIMITS.REVIEW_CONTENT);

      // Verify upsert was called with truncated text
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          review_text: longText.slice(0, LIMITS.REVIEW_CONTENT)
        }),
        expect.anything()
      );
    });
  });

  describe('Logging Listens', () => {
    it('should successfully log a listen with track_id', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);
      chain.single.mockResolvedValue({
        data: { id: 'l1', track_id: '550e8400-e29b-41d4-a716-446655440000', listened_at: new Date().toISOString() },
        error: null
      });

      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({ track_id: '0123456789012345678901', source: 'manual' }),
      });

      const res = await logPOST(req, { user: { id: 'test-user-id' } } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('l1');
    });

    it('should return 503 if catalog is pending', async () => {
      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({ spotify_id: '0123456789012345678902', source: 'manual' }),
      });
      const res = await logPOST(req, { user: { id: 'test-user-id' } } as any);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe('catalog_pending');
    });

    it('should return 401 if unauthorized', async () => {
      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer invalid' }
      });
      const res = await logPOST(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(401);
    });
  });

  describe('Spotify Ingestion', () => {
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
  });

  describe('User Profile Fetch', () => {
    it('should fetch a user profile successfully', async () => {
      const req = new NextRequest('http://localhost/api/users/testuser');
      const res = await userGET(req, { params: Promise.resolve({ username: 'testuser' }) } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe('testuser');
    });

    it('should return 404 for non-existent user', async () => {
      const req = new NextRequest('http://localhost/api/users/missing');
      const res = await userGET(req, { params: Promise.resolve({ username: 'missing' }) } as any);
      expect(res.status).toBe(404);
    });

    it('should return 500 on database error', async () => {
      const req = new NextRequest('http://localhost/api/users/error');
      const res = await userGET(req, { params: Promise.resolve({ username: 'error' }) } as any);
      expect(res.status).toBe(500);
    });
  });

  describe('Search Results', () => {
    it('should clamp search limit', async () => {
      const req = new NextRequest('http://localhost/api/search?q=test&limit=100');
      const res = await searchGET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      // Spotify mock uses the limit passed to searchSpotify
      expect(body.artists.items.length).toBe(LIMITS.SEARCH_LIMIT);
    });

    it('should return 400 for empty query', async () => {
      const req = new NextRequest('http://localhost/api/search?q=');
      const res = await searchGET(req);
      expect(res.status).toBe(400);
    });
  });
});
