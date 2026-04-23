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
  requireApiAuth: vi.fn(async () => ({ id: 'test-user-id', username: 'testuser' })),
  getUserFromRequest: vi.fn(async () => ({ id: 'viewer-id' })),
  handleUnauthorized: vi.fn(() => null),
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

let activeChain: any;
const mockSupabase = {
  from: vi.fn(() => {
    activeChain = createChain();
    return activeChain;
  }),
};

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(async () => mockSupabase),
}));

// Mock Spotify-related Catalog logic
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
  resolveEntityWithPending: vi.fn(),
}));

vi.mock('@/lib/catalog/non-blocking-enrichment', () => ({
  scheduleTrackEnrichment: vi.fn(),
  scheduleAlbumEnrichment: vi.fn(),
  scheduleArtistEnrichment: vi.fn(),
  scheduleTrackEnrichmentBatch: vi.fn(),
}));

// Mock Queries & Side Effects
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

vi.mock('@/lib/taste/enrich-artist-genres', () => ({
  scheduleEnrichArtistGenresForTrackIds: vi.fn(),
}));

vi.mock('@/lib/profile/recent-activity-cache', () => ({
  bustRecentActivityCacheForUser: vi.fn(),
}));

describe('Automated API Logic: Critical Flows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/reviews', () => {
    it('should successfully create a review and truncate long text', async () => {
      const longText = 'a'.repeat(LIMITS.REVIEW_CONTENT + 100);
      const expectedText = 'a'.repeat(LIMITS.REVIEW_CONTENT);

      mockSupabase.from.mockImplementation(() => {
        const chain = createChain();
        chain.single.mockResolvedValue({
          data: {
            id: 'r1',
            entity_type: 'album',
            entity_id: 'a1',
            rating: 5,
            review_text: expectedText,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          error: null
        });
        activeChain = chain;
        return chain;
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

      expect(body.review_text).toBe(expectedText);
      expect(body.review_text.length).toBe(LIMITS.REVIEW_CONTENT);

      // Verify what was sent to Supabase
      const upsertCalls = activeChain.upsert.mock.calls;
      expect(upsertCalls[0][0].review_text).toBe(expectedText);
    });

    it('should return 400 for invalid rating', async () => {
      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: 'album',
          entity_id: 'a1',
          rating: 6
        }),
      });
      const res = await reviewPOST(req, { user: { id: 'test-user-id' } } as any);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/logs', () => {
    it('should successfully log a listen', async () => {
      mockSupabase.from.mockImplementation(() => {
        const chain = createChain();
        chain.single.mockResolvedValue({
          data: { id: 'l1', track_id: 'track-uuid', listened_at: new Date().toISOString() },
          error: null
        });
        activeChain = chain;
        return chain;
      });

      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({ track_id: '2nLhD10Z7Sb4RFyCX2ZCyx', source: 'manual' }),
      });

      const res = await logPOST(req, { user: { id: 'test-user-id' } } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('l1');
    });

    it('should return 400 if track_id is missing', async () => {
      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({ source: 'manual' }),
      });
      const res = await logPOST(req, { user: { id: 'test-user-id' } } as any);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/spotify/sync', () => {
    it('should successfully sync from spotify', async () => {
      mockSupabase.from.mockImplementation(() => {
        const chain = createChain();
        const selectMock = vi.fn().mockImplementation(() => chain);
        chain.select = selectMock;
        chain.eq.mockImplementation(() => chain);
        chain.in.mockResolvedValue({ data: [], error: null });
        chain.insert.mockImplementation(() => chain);

        // Setup sequential returns for select()
        selectMock
          .mockReturnValueOnce(chain) // for the .eq().in() call
          .mockResolvedValueOnce({ data: [{ id: 'l1', track_id: 's1', listened_at: new Date().toISOString(), source: 'spotify' }], error: null }); // for the .insert().select() call

        return chain;
      });

      const req = new NextRequest('http://localhost/api/spotify/sync', { method: 'POST' });
      const res = await syncPOST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.inserted).toBe(1);
    });
  });

  describe('GET /api/users/[username]', () => {
    it('should fetch a user profile', async () => {
      const req = new NextRequest('http://localhost/api/users/testuser');
      const res = await userGET(req, { params: { username: 'testuser' } } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe('testuser');
    });

    it('should return 404 for non-existent user', async () => {
      const req = new NextRequest('http://localhost/api/users/missing');
      const res = await userGET(req, { params: { username: 'missing' } } as any);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/search', () => {
    it('should return search results and clamp limit', async () => {
      const req = new NextRequest('http://localhost/api/search?q=test&limit=100');
      const res = await searchGET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.artists.items.length).toBeGreaterThan(0);

      const { searchSpotify } = await import('@/lib/spotify');
      const searchCalls = vi.mocked(searchSpotify).mock.calls;
      // LIMITS.SEARCH_LIMIT is 10
      expect(searchCalls[0][2]).toBe(LIMITS.SEARCH_LIMIT);
    });

    it('should return 400 for empty query', async () => {
      const req = new NextRequest('http://localhost/api/search?q=');
      const res = await searchGET(req);
      expect(res.status).toBe(400);
    });
  });
});
