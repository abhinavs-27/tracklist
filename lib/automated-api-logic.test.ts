import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { POST as reviewPOST } from '../app/api/reviews/route';
import { POST as logPOST } from '../app/api/logs/route';
import { POST as syncPOST } from '../app/api/spotify/sync/route';
import { GET as userGET } from '../app/api/users/[username]/route';
import { GET as searchGET } from '../app/api/search/route';
import { requireApiAuth } from '@/lib/auth';

// --- Mocks ---

// Mock helpers to avoid hoisting issues
const mockSupabase = {
  from: vi.fn(() => createMockChain()),
};

function createMockChain() {
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

vi.mock('@/lib/auth', async () => {
  const original = await vi.importActual<any>('@/lib/auth');
  return {
    ...original,
    requireApiAuth: vi.fn(async () => ({ id: 'test-user-id', username: 'testuser' })),
    getUserFromRequest: vi.fn(async () => ({ id: 'viewer-id' })),
    handleUnauthorized: vi.fn((e) => {
        if (e && e.message === 'Unauthorized') {
            return { status: 401, json: async () => ({ error: 'Unauthorized' }) };
        }
        return null;
    }),
  };
});

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
  resolveEntityWithPending: vi.fn(async () => ({ kind: 'resolved', id: 'uuid' })),
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

describe('Automated API Logic: Critical Flows (Vitest)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireApiAuth).mockResolvedValue({ id: 'test-user-id', username: 'testuser' } as any);
  });

  describe('POST /api/reviews', () => {
    it('should successfully create/upsert a review', async () => {
      const chain = createMockChain();
      mockSupabase.from.mockReturnValue(chain);
      chain.single.mockResolvedValueOnce({
          data: { id: 'r1', entity_type: 'album', entity_id: 'a1', rating: 5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
          error: null
      });

      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 5, review_text: 'Great!' }),
      });

      const res = await reviewPOST(req, { params: Promise.resolve({}) } as any);
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
        const res = await reviewPOST(req, { params: Promise.resolve({}) } as any);
        expect(res.status).toBe(400);
    });

    it('should truncate long review text to 10k chars', async () => {
        const longText = 'a'.repeat(11000);
        const chain = createMockChain();
        mockSupabase.from.mockReturnValue(chain);
        chain.single.mockResolvedValueOnce({
            data: { id: 'r1', entity_type: 'album', entity_id: 'a1', rating: 5, review_text: longText.slice(0, 10000) },
            error: null
        });

        const req = new NextRequest('http://localhost/api/reviews', {
          method: 'POST',
          body: JSON.stringify({ entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 5, review_text: longText }),
        });

        const res = await reviewPOST(req, { params: Promise.resolve({}) } as any);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.review_text.length).toBe(10000);

        // Verify upsert call had truncated text
        expect(chain.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ review_text: longText.slice(0, 10000) }),
            expect.anything()
        );
    });

    it('should return 401 if unauthorized', async () => {
        vi.mocked(requireApiAuth).mockRejectedValueOnce(new Error('Unauthorized'));
        const req = new NextRequest('http://localhost/api/reviews', {
          method: 'POST',
          body: JSON.stringify({ entity_type: 'album', entity_id: 'a1', rating: 5 }),
        });
        // withHandler handles the error and calls handleUnauthorized
        const res = await reviewPOST(req, { params: Promise.resolve({}) } as any);
        expect(res.status).toBe(401);
    });
  });

  describe('POST /api/logs', () => {
    it('should successfully log a listen with track_id', async () => {
      const chain = createMockChain();
      mockSupabase.from.mockReturnValue(chain);
      chain.single.mockResolvedValue({
        data: { id: 'l1', track_id: 'track-uuid', listened_at: new Date().toISOString() },
        error: null
      });

      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({ track_id: '550e8400-e29b-41d4-a716-446655440000', source: 'manual' }),
      });

      const res = await logPOST(req, { params: Promise.resolve({}) } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('l1');
    });

    it('should successfully log a listen with spotify_id', async () => {
        const chain = createMockChain();
        mockSupabase.from.mockReturnValue(chain);
        chain.single.mockResolvedValue({
          data: { id: 'l1', track_id: 'track-uuid', listened_at: new Date().toISOString() },
          error: null
        });

        const req = new NextRequest('http://localhost/api/logs', {
          method: 'POST',
          body: JSON.stringify({ spotify_id: '2nLhD10Z7Sb4RFyCX2ZCyx', source: 'manual' }),
        });

        const res = await logPOST(req, { params: Promise.resolve({}) } as any);
        expect(res.status).toBe(200);
    });

    it('should return 503 if catalog is pending', async () => {
        const { getTrackIdByExternalId } = await import('@/lib/catalog/entity-resolution');
        vi.mocked(getTrackIdByExternalId).mockResolvedValueOnce(null);

        const req = new NextRequest('http://localhost/api/logs', {
          method: 'POST',
          body: JSON.stringify({ track_id: '2nLhD10Z7Sb4RFyCX2ZCyx', source: 'manual' }),
        });
        const res = await logPOST(req, { params: Promise.resolve({}) } as any);
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.code).toBe('catalog_pending');
    });

    it('should return 401 if unauthorized', async () => {
        vi.mocked(requireApiAuth).mockRejectedValueOnce(new Error('Unauthorized'));
        const req = new NextRequest('http://localhost/api/logs', {
          method: 'POST',
          body: JSON.stringify({ track_id: 'track-uuid' }),
        });
        const res = await logPOST(req, { params: Promise.resolve({}) } as any);
        expect(res.status).toBe(401);
    });
  });

  describe('POST /api/spotify/sync', () => {
    it('should successfully sync from spotify', async () => {
        const firstChain = createMockChain();
        const secondChain = createMockChain();
        mockSupabase.from
          .mockReturnValueOnce(firstChain) // check existing
          .mockReturnValueOnce(secondChain); // insert result fetch

        firstChain.in.mockResolvedValue({ data: [], error: null });
        secondChain.select.mockResolvedValue({ data: [{ id: 'l1' }], error: null });

        const req = new NextRequest('http://localhost/api/spotify/sync', { method: 'POST' });
        const res = await syncPOST(req, { params: Promise.resolve({}) } as any);
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

    it('should return 500 on database error', async () => {
        // GET user does not requireAuth: true, so requireApiAuth is not called by withHandler.
        // It calls getFullUserProfile which we mocked to throw.
        const req = new NextRequest('http://localhost/api/users/error');
        const res = await userGET(req, { params: { username: 'error' } } as any);
        expect(res.status).toBe(500);
    });
  });

  describe('GET /api/search', () => {
    it('should return search results', async () => {
      const req = new NextRequest('http://localhost/api/search?q=test');
      const res = await searchGET(req, { params: Promise.resolve({}) } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.artists.items.length).toBeGreaterThan(0);
    });

    it('should return 400 for empty query', async () => {
        const req = new NextRequest('http://localhost/api/search?q=');
        const res = await searchGET(req, { params: Promise.resolve({}) } as any);
        expect(res.status).toBe(400);
    });

    it('should clamp limit to 10', async () => {
        const req = new NextRequest('http://localhost/api/search?q=test&limit=50');
        const res = await searchGET(req, { params: Promise.resolve({}) } as any);
        expect(res.status).toBe(200);

        const { searchSpotify } = await import('@/lib/spotify');
        expect(searchSpotify).toHaveBeenCalledWith(expect.anything(), expect.anything(), 10);
    });
  });
});
