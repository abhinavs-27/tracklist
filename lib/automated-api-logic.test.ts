import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { POST as reviewPOST } from '../app/api/reviews/route';
import { POST as logPOST } from '../app/api/logs/route';
import { POST as syncPOST } from '../app/api/spotify/sync/route';
import { GET as userGET } from '../app/api/users/[username]/route';
import { GET as searchGET } from '../app/api/search/route';

// --- Mocks ---

vi.mock('@/lib/auth', () => ({
  requireApiAuth: vi.fn(async () => ({ id: 'test-user-id', username: 'testuser' })),
  getUserFromRequest: vi.fn(async () => ({ id: 'viewer-id' })),
  handleUnauthorized: vi.fn((e) => {
    if (e.message === 'Unauthorized') {
        return { status: 401, json: async () => ({ error: 'Unauthorized' }) };
    }
    return null;
  }),
}));

// Mock Supabase with fresh chain per call to prevent shared state
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
    then: vi.fn().mockImplementation((onFullfilled) => Promise.resolve({ data: chain._data, error: chain._error }).then(onFullfilled)),
    _data: null,
    _error: null,
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
  resolveEntityWithPending: vi.fn(async () => ({ kind: 'resolved', id: 'resolved-uuid' })),
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

describe('Automated API Logic Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Review Creation', () => {
    it('should truncate long review text to 10,000 characters', async () => {
      const longText = 'a'.repeat(11000);
      const chain = createChain();
      chain._data = { id: 'r1', entity_type: 'album', entity_id: 'a1', rating: 5, review_text: longText.slice(0, 10000), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      mockSupabase.from.mockReturnValue(chain);

      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 5, review_text: longText }),
      });

      const res = await reviewPOST(req, { user: { id: 'test-user-id' } } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.review_text.length).toBe(10000);

      // Verify the upsert call received truncated text
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ review_text: longText.slice(0, 10000) }),
        expect.any(Object)
      );
    });

    it('should return 401 if user is not authenticated', async () => {
      const { requireApiAuth } = await import('@/lib/auth');
      vi.mocked(requireApiAuth).mockRejectedValueOnce(new Error('Unauthorized'));

      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: 'a1', rating: 5 }),
      });

      // withHandler will catch the error and call handleUnauthorized
      const res = await reviewPOST(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(401);
    });

    it('should return 400 for invalid rating', async () => {
      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: 'a1', rating: 6 }),
      });
      const res = await reviewPOST(req, { user: { id: 'test-user-id' } } as any);
      expect(res.status).toBe(400);
    });
  });

  describe('Listen Logging', () => {
    it('should return 503 if catalog is pending', async () => {
      const { getTrackIdByExternalId } = await import('@/lib/catalog/entity-resolution');
      vi.mocked(getTrackIdByExternalId).mockResolvedValueOnce(null);

      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({ track_id: '2nLhD10Z7Sb4RFyCX2ZCyx', source: 'manual' }),
      });
      const res = await logPOST(req, { user: { id: 'test-user-id' } } as any);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe('catalog_pending');
    });

    it('should successfully log with spotify_id', async () => {
      const chain = createChain();
      chain._data = { id: 'l1', track_id: 'track-uuid', listened_at: new Date().toISOString() };
      mockSupabase.from.mockReturnValue(chain);

      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({ spotify_id: '2nLhD10Z7Sb4RFyCX2ZCyx', source: 'manual' }),
      });

      const res = await logPOST(req, { user: { id: 'test-user-id' } } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('l1');
    });
  });

  describe('Search results', () => {
    it('should clamp limit to maximum defined in LIMITS.SEARCH_LIMIT', async () => {
      const { LIMITS } = await import('@/lib/validation');
      const req = new NextRequest(`http://localhost/api/search?q=test&limit=${LIMITS.SEARCH_LIMIT + 10}`);
      const res = await searchGET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      // searchSpotify mock uses the limit passed to it
      expect(body.artists.items.length).toBe(LIMITS.SEARCH_LIMIT);
    });

    it('should return 400 for empty queries', async () => {
        const req = new NextRequest('http://localhost/api/search?q=');
        const res = await searchGET(req);
        expect(res.status).toBe(400);
    });
  });

  describe('User Profile Fetch', () => {
    it('should return 404 for missing user', async () => {
        const req = new NextRequest('http://localhost/api/users/missing');
        const res = await userGET(req, { params: { username: 'missing' } } as any);
        expect(res.status).toBe(404);
    });

    it('should return 200 for valid user', async () => {
        const req = new NextRequest('http://localhost/api/users/testuser');
        const res = await userGET(req, { params: { username: 'testuser' } } as any);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.username).toBe('testuser');
    });
  });

  describe('Spotify Ingestion', () => {
      it('should record success for each ingested track', async () => {
          const firstChain = createChain();
          const secondChain = createChain();
          mockSupabase.from
            .mockReturnValueOnce(firstChain)
            .mockReturnValueOnce(secondChain);

          firstChain._data = []; // no existing logs
          secondChain._data = [{ id: 'l1' }];

          const req = new NextRequest('http://localhost/api/spotify/sync', { method: 'POST' });
          const res = await syncPOST(req);
          expect(res.status).toBe(200);
          const body = await res.json();
          expect(body.inserted).toBe(1);
      });
  });
});
