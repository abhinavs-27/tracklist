import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { POST as reviewPOST } from '../app/api/reviews/route';
import { POST as logPOST } from '../app/api/logs/route';
import { POST as syncPOST } from '../app/api/spotify/sync/route';
import { GET as userGET } from '../app/api/users/[username]/route';
import { GET as searchGET } from '../app/api/search/route';
import { validateRating, validateEntityType } from './validation';
import { validateUuidParam } from './api-utils';

// --- Mocks ---

vi.mock('server-only', () => ({}));

vi.mock('@/lib/auth', () => ({
  requireApiAuth: vi.fn(async () => ({ id: 'test-user-id', username: 'testuser' })),
  getUserFromRequest: vi.fn(async () => ({ id: 'viewer-id' })),
  handleUnauthorized: vi.fn(() => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })),
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
    if (username === 'error') {
        throw new Error('Database failure');
    }
    return null;
  }),
  getListenLogsForUser: vi.fn(async () => []),
  grantAchievementOnReview: vi.fn(),
  grantAchievementsOnListen: vi.fn(),
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

describe('Critical Flows: Consolidated Integration (Vitest)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Validation Logic (Unit)', () => {
    it('should validate ratings correctly', () => {
      expect(validateRating(0).ok).toBe(false);
      expect(validateRating(5).ok).toBe(true);
      expect(validateRating(6).ok).toBe(false);
    });

    it('should validate entity types', () => {
      expect(validateEntityType('album').ok).toBe(true);
      expect(validateEntityType('song').ok).toBe(true);
      expect(validateEntityType('artist').ok).toBe(false);
    });

    it('should validate UUIDs', () => {
      expect(validateUuidParam('invalid').ok).toBe(false);
      expect(validateUuidParam('550e8400-e29b-41d4-a716-446655440000').ok).toBe(true);
    });
  });

  describe('POST /api/reviews', () => {
    it('should successfully create/upsert a review', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);
      chain.single
        .mockResolvedValueOnce({
            data: { id: 'r1', entity_type: 'album', entity_id: 'a1', rating: 5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
            error: null
        });

      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 5, review_text: 'Great!' }),
      });

      const res = await reviewPOST(req, { user: { id: 'test-user-id' } } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('r1');
    });

    it('should return 401 if unauthorized', async () => {
        const { requireApiAuth } = await import('@/lib/auth');
        vi.mocked(requireApiAuth).mockRejectedValueOnce(new Error('Unauthorized access'));

        const req = new NextRequest('http://localhost/api/reviews', { method: 'POST', body: JSON.stringify({}) });
        // When using withHandler, the auth error is caught and handleUnauthorized is called.
        // Our mock of handleUnauthorized returns a 401.
        const res = await reviewPOST(req, { params: {} } as any);
        expect(res.status).toBe(401);
    });

    it('should return 409 if review already exists (conflict)', async () => {
        const chain = createChain();
        mockSupabase.from.mockReturnValue(chain);
        chain.single.mockResolvedValueOnce({
            data: null,
            error: { code: '23505', message: 'Unique constraint violation' }
        });

        const req = new NextRequest('http://localhost/api/reviews', {
            method: 'POST',
            body: JSON.stringify({ entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 5 }),
        });
        const res = await reviewPOST(req, { user: { id: 'test-user-id' } } as any);
        expect(res.status).toBe(409);
        const body = await res.json();
        expect(body.error).toContain('already reviewed');
    });

    it('should return 500 if database error (upsert failure)', async () => {
        const chain = createChain();
        mockSupabase.from.mockReturnValue(chain);
        chain.single.mockResolvedValueOnce({
            data: null,
            error: { code: 'some-error', message: 'DB Failure' }
        });

        const req = new NextRequest('http://localhost/api/reviews', {
            method: 'POST',
            body: JSON.stringify({ entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 5 }),
        });
        const res = await reviewPOST(req, { user: { id: 'test-user-id' } } as any);
        expect(res.status).toBe(500);
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

  describe('POST /api/logs', () => {
    it('should successfully log a listen', async () => {
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
    });

    it('should return 400 if track_id is missing', async () => {
        const req = new NextRequest('http://localhost/api/logs', {
          method: 'POST',
          body: JSON.stringify({ source: 'manual' }),
        });
        const res = await logPOST(req, { user: { id: 'test-user-id' } } as any);
        expect(res.status).toBe(400);
    });

    it('should return 503 if catalog is pending', async () => {
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
    it('should successfully sync from spotify', async () => {
        const firstChain = createChain();
        const secondChain = createChain();
        mockSupabase.from
          .mockReturnValueOnce(firstChain)
          .mockReturnValueOnce(secondChain);

        firstChain.in.mockResolvedValue({ data: [], error: null });
        secondChain.select.mockResolvedValue({ data: [{ id: 'l1' }], error: null });

        const req = new NextRequest('http://localhost/api/spotify/sync', { method: 'POST' });
        const res = await syncPOST(req, { user: { id: 'test-user-id' } } as any);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.inserted).toBe(1);
    });

    it('should skip already ingested tracks', async () => {
        const firstChain = createChain();
        mockSupabase.from.mockReturnValueOnce(firstChain);
        firstChain.in.mockResolvedValueOnce({ data: [{ track_id: 's1' }], error: null });

        const req = new NextRequest('http://localhost/api/spotify/sync', { method: 'POST' });
        const res = await syncPOST(req, { user: { id: 'test-user-id' } } as any);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.inserted).toBe(0);
        expect(body.skipped).toBe(1);
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
    it('should return search results', async () => {
      const req = new NextRequest('http://localhost/api/search?q=test');
      const res = await searchGET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.artists.items.length).toBeGreaterThan(0);
    });

    it('should return 400 for empty query', async () => {
        const req = new NextRequest('http://localhost/api/search?q=');
        const res = await searchGET(req);
        expect(res.status).toBe(400);
    });
  });
});
