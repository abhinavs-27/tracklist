import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { POST as reviewPOST } from '../app/api/reviews/route';
import { POST as logPOST } from '../app/api/logs/route';
import { POST as syncPOST } from '../app/api/spotify/sync/route';
import { GET as userGET } from '../app/api/users/[username]/route';
import { GET as searchGET } from '../app/api/search/route';
import { LIMITS } from '@/lib/validation';

// --- Mocks ---

vi.mock('@/lib/auth', () => ({
  requireApiAuth: vi.fn(async () => ({ id: 'test-user-id', username: 'testuser' })),
  getUserFromRequest: vi.fn(async () => ({ id: 'viewer-id' })),
  handleUnauthorized: vi.fn((e) => {
    if (e?.status === 401) return { status: 401 };
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

const mockSupabase = {
  from: vi.fn(),
};

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(async () => mockSupabase),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdminClient: vi.fn(() => mockSupabase),
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

vi.mock('@/lib/catalog/entity-resolution', () => ({
  getTrackIdByExternalId: vi.fn(async () => 'track-uuid'),
  getAlbumIdByExternalId: vi.fn(async () => 'album-uuid'),
  getArtistIdByExternalId: vi.fn(async () => 'artist-uuid'),
}));

vi.mock('@/lib/catalog/non-blocking-enrichment', () => ({
  scheduleTrackEnrichment: vi.fn(),
  scheduleAlbumEnrichment: vi.fn(),
  scheduleArtistEnrichment: vi.fn(),
  scheduleTrackEnrichmentBatch: vi.fn(),
}));

// Mock internal helpers
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
}));

vi.mock('@/lib/feed/generate-events', () => ({
  recordRatingFeedEvent: vi.fn(),
}));

vi.mock('@/lib/community/community-feed-insert', () => ({
  fanOutReviewForUserCommunities: vi.fn(),
  fanOutListenForUserCommunities: vi.fn(),
}));

vi.mock('@/lib/spotify-user', () => ({
  getValidSpotifyAccessToken: vi.fn(async () => 'mock-token'),
  getRecentlyPlayed: vi.fn(async () => ({
    items: [{ played_at: new Date().toISOString(), track: { id: 's1' } }],
  })),
}));

vi.mock('@/lib/sync-manual-log-side-effects', () => ({
  syncManualLogSideEffects: vi.fn(),
}));

vi.mock('@/lib/spotify-integration-enabled', () => ({
  isSpotifyIntegrationEnabled: vi.fn(() => true),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkSpotifyRateLimit: vi.fn(() => true),
}));

vi.mock('@/lib/profile/recent-activity-cache', () => ({
  bustRecentActivityCacheForUser: vi.fn(),
}));

vi.mock('@/lib/taste/enrich-artist-genres', () => ({
  scheduleEnrichArtistGenresForTrackIds: vi.fn(),
}));

describe('Critical Flows v4: API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/reviews', () => {
    it('should successfully create/upsert a review with truncated text', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);

      const longText = 'A'.repeat(LIMITS.REVIEW_CONTENT + 100);

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

      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
            review_text: expect.stringMatching(new RegExp(`^A{${LIMITS.REVIEW_CONTENT}}$`))
        }),
        expect.any(Object)
      );
    });

    it('should return 400 for invalid rating step', async () => {
        const req = new NextRequest('http://localhost/api/reviews', {
          method: 'POST',
          body: JSON.stringify({ entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 3.2 }),
        });
        const res = await reviewPOST(req, { user: { id: 'test-user-id' } } as any);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('half-star steps');
    });
  });

  describe('POST /api/logs', () => {
    it('should successfully log a listen and trigger community fan-out', async () => {
      const { fanOutListenForUserCommunities } = await import('@/lib/community/community-feed-insert');
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

      const res = await logPOST(req, { user: { id: 'test-user-id' } } as any);
      expect(res.status).toBe(200);
      expect(fanOutListenForUserCommunities).toHaveBeenCalled();
    });

    it('should return 503 if catalog resolution is null (pending)', async () => {
        const { getTrackIdByExternalId } = await import('@/lib/catalog/entity-resolution');
        vi.mocked(getTrackIdByExternalId).mockResolvedValueOnce(null);

        const req = new NextRequest('http://localhost/api/logs', {
          method: 'POST',
          body: JSON.stringify({ track_id: '2nLhD10Z7Sb4RFyCX2ZCyx', source: 'manual' }),
        });
        const res = await logPOST(req, { user: { id: 'test-user-id' } } as any);
        expect(res.status).toBe(503);
    });
  });

  describe('POST /api/spotify/sync', () => {
    it('should insert items and return correct count', async () => {
        const firstChain = createChain();
        const secondChain = createChain();

        mockSupabase.from
          .mockReturnValueOnce(firstChain)
          .mockReturnValueOnce(secondChain);

        // 1. fetch existing check
        firstChain.in.mockResolvedValueOnce({ data: [], error: null });
        // 2. select for insertion results
        secondChain.select.mockResolvedValueOnce({ data: [{ id: 'l1', track_id: 's1', listened_at: new Date().toISOString(), source: 'spotify' }], error: null });

        const req = new NextRequest('http://localhost/api/spotify/sync', { method: 'POST' });
        const res = await syncPOST(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.inserted).toBe(1);
    });
  });

  describe('GET /api/users/[username]', () => {
    it('should handle 404 for missing users', async () => {
        const req = new NextRequest('http://localhost/api/users/missing');
        const res = await userGET(req, { params: { username: 'missing' } } as any);
        expect(res.status).toBe(404);
    });
  });

  describe('GET /api/search', () => {
    it('should clamp search limit to max allowed', async () => {
      const req = new NextRequest(`http://localhost/api/search?q=test&limit=${LIMITS.SEARCH_LIMIT + 50}`);
      const res = await searchGET(req);
      expect(res.status).toBe(200);

      const { searchSpotify } = await import('@/lib/spotify');
      expect(searchSpotify).toHaveBeenCalledWith('test', expect.any(Array), LIMITS.SEARCH_LIMIT);
    });

    it('should return 400 for empty queries', async () => {
        const req = new NextRequest('http://localhost/api/search?q=  ');
        const res = await searchGET(req);
        expect(res.status).toBe(400);
    });
  });
});
