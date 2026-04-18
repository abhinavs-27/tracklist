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
  handleUnauthorized: vi.fn(() => null),
  requireAuth: vi.fn(async () => ({ id: 'test-user-id' })),
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
    update: vi.fn().mockImplementation(() => chain),
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
  getTrackIdByExternalId: vi.fn(async (supabase, provider, id) => id === '1234567890123456789012' ? null : 'track-uuid'),
  getAlbumIdByExternalId: vi.fn(async () => 'album-uuid'),
  getArtistIdByExternalId: vi.fn(async () => 'artist-uuid'),
}));

vi.mock('@/lib/catalog/non-blocking-enrichment', () => ({
  scheduleTrackEnrichment: vi.fn(),
  scheduleAlbumEnrichment: vi.fn(),
  scheduleArtistEnrichment: vi.fn(),
  scheduleTrackEnrichmentBatch: vi.fn(),
}));

// Mock other internal helpers to avoid DB/external calls
vi.mock('@/lib/queries', () => ({
  grantAchievementOnReview: vi.fn(),
  grantAchievementsOnListen: vi.fn(),
  getReviewsForEntity: vi.fn(),
  fetchUserSummary: vi.fn(async (userId) => ({ id: userId, username: 'testuser', avatar_url: null })),
  getFullUserProfile: vi.fn(async (username) => {
    if (username === 'testuser') {
        return { id: 'test-user-id', username: 'testuser', bio: 'Test bio' };
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

describe('Critical Flows: Automated API Logic (Vitest)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/reviews', () => {
    it('should successfully create a review and truncate long text', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);

      const longText = 'A'.repeat(LIMITS.REVIEW_CONTENT + 100);
      const expectedText = 'A'.repeat(LIMITS.REVIEW_CONTENT);

      chain.single.mockResolvedValueOnce({
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
        expect.objectContaining({ review_text: expectedText }),
        expect.anything()
      );
    });

    it('should return 400 for non-half-star rating', async () => {
        const req = new NextRequest('http://localhost/api/reviews', {
          method: 'POST',
          body: JSON.stringify({ entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 4.2 }),
        });
        const res = await reviewPOST(req, { user: { id: 'test-user-id' } } as any);
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain('half-star steps');
    });
  });

  describe('POST /api/logs', () => {
    it('should accept both track_id and spotify_id', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);
      chain.single.mockResolvedValue({
        data: { id: 'l1', track_id: 'track-uuid', listened_at: new Date().toISOString() },
        error: null
      });

      // Test track_id
      const req1 = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({ track_id: '2nLhD10Z7Sb4RFyCX2ZCyx' }),
      });
      const res1 = await logPOST(req1, { user: { id: 'test-user-id' } } as any);
      expect(res1.status).toBe(200);

      // Test spotify_id
      const req2 = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({ spotify_id: '0nLhD10Z7Sb4RFyCX2ZCyx' }),
      });
      const res2 = await logPOST(req2, { user: { id: 'test-user-id' } } as any);
      expect(res2.status).toBe(200);
    });

    it('should return 503 if catalog resolution is pending', async () => {
        const req = new NextRequest('http://localhost/api/logs', {
          method: 'POST',
          body: JSON.stringify({ track_id: '1234567890123456789012' }),
        });
        const res = await logPOST(req, { user: { id: 'test-user-id' } } as any);
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
        const { getRecentlyPlayed } = await import('@/lib/spotify-user');
        vi.mocked(getRecentlyPlayed).mockRejectedValueOnce(new Error('Spotify API down'));

        const req = new NextRequest('http://localhost/api/spotify/sync', { method: 'POST' });
        const res = await syncPOST(req);
        expect(res.status).toBe(500);
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
    it('should return search results and respect limit clamping', async () => {
      const req = new NextRequest('http://localhost/api/search?q=test&limit=50');
      const res = await searchGET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      // Search limit is clamped to 10
      expect(body.artists.items.length).toBe(10);
    });

    it('should return 400 for empty query', async () => {
        const req = new NextRequest('http://localhost/api/search?q=');
        const res = await searchGET(req);
        expect(res.status).toBe(400);
    });
  });
});
