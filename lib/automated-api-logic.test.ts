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
  handleUnauthorized: vi.fn((e) => {
    if (e instanceof Error && e.message === 'Unauthorized') {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }
    return null;
  }),
}));

// Mock Supabase
function createChain(fixedData?: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    upsert: vi.fn((data) => {
        if (data && !Array.isArray(data)) {
            fixedData = { ...data, id: 'r1', created_at: new Date().toISOString() };
        }
        return chain;
    }),
    update: vi.fn(() => chain),
    single: vi.fn(() => chain),
    maybeSingle: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    range: vi.fn(() => chain),
    // Correctly simulate thenable to allow both `await supabase...` and `.then()`
    then: vi.fn((onfulfilled, onrejected) => {
      const data = typeof fixedData === 'function' ? fixedData() : fixedData;
      return Promise.resolve({ data: data ?? null, error: null }).then(onfulfilled, onrejected);
    }),
  };
  return chain;
}

const mockSupabase = {
  from: vi.fn(() => {
    return createChain();
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
  resolveEntityWithPending: vi.fn(async () => ({ id: 'internal-uuid', status: 'ready' })),
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
  createSupabaseAdminClient: vi.fn(() => mockSupabase),
}));

vi.mock('@/lib/taste/enrich-artist-genres', () => ({
  scheduleEnrichArtistGenresForTrackIds: vi.fn(),
}));

vi.mock('@/lib/profile/recent-activity-cache', () => ({
  bustRecentActivityCacheForUser: vi.fn(),
}));

describe('Critical Flows: API Integration v4 (Vitest)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/reviews', () => {
    it('should successfully create/upsert a review', async () => {
      const chain = createChain({
        id: 'r1',
        user_id: 'test-user-id',
        entity_type: 'album',
        entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx',
        rating: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      vi.mocked(mockSupabase.from).mockReturnValue(chain);

      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 5, review_text: 'Great!' }),
      });

      const res = await reviewPOST(req, { params: {} } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('r1');
      expect(body.rating).toBe(5);
    });

    it('should truncate review text to LIMITS.REVIEW_CONTENT', async () => {
      const longText = 'A'.repeat(LIMITS.REVIEW_CONTENT + 100);
      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 5, review_text: longText }),
      });

      const res = await reviewPOST(req, { user: { id: 'test-user-id' } } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.review_text.length).toBe(LIMITS.REVIEW_CONTENT);
    });

    it('should return 400 for invalid rating', async () => {
      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: 'a1', rating: 6 }),
      });
      const res = await reviewPOST(req, { user: { id: 'test-user-id' } } as any);
      expect(res.status).toBe(400);
    });

    it('should return 401 if unauthorized', async () => {
      const { requireApiAuth } = await import('@/lib/auth');
      vi.mocked(requireApiAuth).mockRejectedValueOnce(new Error('Unauthorized'));

      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: 'a1', rating: 5 }),
      });

      const res = await reviewPOST(req, { params: {} } as any);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/logs', () => {
    it('should successfully log a listen', async () => {
      const chain = createChain({ id: 'l1', track_id: 'track-uuid', listened_at: new Date().toISOString() });
      vi.mocked(mockSupabase.from).mockReturnValue(chain);

      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({ track_id: '2nLhD10Z7Sb4RFyCX2ZCyx', source: 'manual' }),
      });

      const res = await logPOST(req, { params: {} } as any);
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
  });

  describe('POST /api/spotify/sync', () => {
    it('should successfully sync from spotify', async () => {
      const firstChain = createChain([]);
      const secondChain = createChain([]);
      const thirdChain = createChain([{ id: 'l1' }]);

      vi.mocked(mockSupabase.from)
        .mockReturnValueOnce(firstChain) // check existing
        .mockReturnValueOnce(secondChain) // insert
        .mockReturnValueOnce(thirdChain); // select

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

    it('should clamp limit to LIMITS.SEARCH_LIMIT', async () => {
      const req = new NextRequest('http://localhost/api/search?q=test&limit=100');
      await searchGET(req);
      const { searchSpotify } = await import('@/lib/spotify');
      expect(searchSpotify).toHaveBeenCalledWith('test', ['artist', 'album', 'track'], LIMITS.SEARCH_LIMIT);
    });

    it('should return empty results if nothing found', async () => {
      const req = new NextRequest('http://localhost/api/search?q=noresults');
      const res = await searchGET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.artists.items.length).toBe(0);
    });
  });
});
