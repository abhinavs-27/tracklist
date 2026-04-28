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
  requireApiAuth: vi.fn(),
  getUserFromRequest: vi.fn(),
  handleUnauthorized: vi.fn((e) => {
    if (e?.status === 401) return { status: 401, json: async () => ({ error: 'Unauthorized' }) };
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
      artists: { items: [{ id: '4Y9Xp6QpY6Lp9ZkG5R2M8j', name: 'Test Artist' }] },
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
  getTrackIdByExternalId: vi.fn(),
  getAlbumIdByExternalId: vi.fn(),
  getArtistIdByExternalId: vi.fn(),
  resolveAndCheckPending: vi.fn(),
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
    items: [{ played_at: new Date().toISOString(), track: { id: '1v679S97v9026pXvS97v90' } }],
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

describe('Critical Flows V4: API Integration (Vitest)', () => {
  beforeEach(async () => {
    vi.resetAllMocks();

    // Default auth mock
    const { requireApiAuth } = await import('@/lib/auth');
    vi.mocked(requireApiAuth).mockResolvedValue({ id: 'test-user-id', username: 'testuser' });

    // Default entity resolution mocks
    const { getTrackIdByExternalId, getAlbumIdByExternalId, getArtistIdByExternalId } = await import('@/lib/catalog/entity-resolution');
    vi.mocked(getTrackIdByExternalId).mockResolvedValue('550e8400-e29b-41d4-a716-446655440000');
    vi.mocked(getAlbumIdByExternalId).mockResolvedValue('660e8400-e29b-41d4-a716-446655440001');
    vi.mocked(getArtistIdByExternalId).mockResolvedValue('770e8400-e29b-41d4-a716-446655440002');
  });

  describe('POST /api/reviews', () => {
    it('should successfully create/upsert a review with valid 22-char Spotify ID', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);
      chain.single.mockResolvedValueOnce({
        data: {
          id: 'review-uuid',
          entity_type: 'album',
          entity_id: '4Y9Xp6QpY6Lp9ZkG5R2M8j',
          rating: 5,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        error: null
      });

      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: 'album',
          entity_id: '4Y9Xp6QpY6Lp9ZkG5R2M8j', // 22 chars
          rating: 5,
          review_text: 'Great!'
        }),
      });

      const res = await reviewPOST(req, { params: Promise.resolve({}) } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('review-uuid');
      expect(body.rating).toBe(5);
    });

    it('should return 400 for invalid rating (e.g. 6)', async () => {
      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: 'album',
          entity_id: '4Y9Xp6QpY6Lp9ZkG5R2M8j',
          rating: 6
        }),
      });
      const res = await reviewPOST(req, { params: Promise.resolve({}) } as any);
      expect(res.status).toBe(400);
    });

    it('should return 401 if unauthorized', async () => {
      const { requireApiAuth } = await import('@/lib/auth');
      vi.mocked(requireApiAuth).mockImplementationOnce(async () => {
        const err: any = new Error('Unauthorized');
        err.status = 401;
        throw err;
      });

      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: 'album',
          entity_id: '4Y9Xp6QpY6Lp9ZkG5R2M8j',
          rating: 5
        }),
      });
      const res = await reviewPOST(req, { params: Promise.resolve({}) } as any);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/logs', () => {
    it('should successfully log a listen', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);
      chain.single.mockResolvedValue({
        data: {
          id: 'log-uuid',
          track_id: '550e8400-e29b-41d4-a716-446655440000',
          listened_at: new Date().toISOString()
        },
        error: null
      });

      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({
          track_id: '1v679S97v9026pXvS97v90', // 22 chars Spotify ID
          source: 'manual'
        }),
      });

      const res = await logPOST(req, { params: Promise.resolve({}) } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('log-uuid');
    });

    it('should return 503 if catalog is pending', async () => {
      const { getTrackIdByExternalId } = await import('@/lib/catalog/entity-resolution');
      vi.mocked(getTrackIdByExternalId).mockResolvedValueOnce(null);

      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({
          track_id: '1v679S97v9026pXvS97v90',
          source: 'manual'
        }),
      });
      const res = await logPOST(req, { params: Promise.resolve({}) } as any);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe('catalog_pending');
    });
  });

  describe('POST /api/spotify/sync', () => {
    it('should successfully sync from spotify', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);

      // 1. Mock first chain (.from().select().eq().in())
      // We must be careful about fluent chaining.
      // We'll use a specific mock for 'in' which is the terminator here.
      chain.in.mockResolvedValueOnce({ data: [], error: null });

      // 2. Mock second chain (.from().insert().select())
      // Here 'select' is the terminator.
      // Since 'select' is used in both chains, we use mockReturnValueOnce for the first
      // and mockResolvedValueOnce for the second.
      chain.select
        .mockReturnValueOnce(chain) // 1st chain: select(...) -> chain
        .mockResolvedValueOnce({    // 2nd chain: select(...) -> result
          data: [{
            id: 'log-uuid-1',
            track_id: '1v679S97v9026pXvS97v90',
            listened_at: new Date().toISOString(),
            source: 'spotify'
          }],
          error: null
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
  });

  describe('GET /api/search', () => {
    it('should return search results', async () => {
      const req = new NextRequest('http://localhost/api/search?q=test');
      const res = await searchGET(req, { params: Promise.resolve({}) } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.artists.items.length).toBeGreaterThan(0);
      expect(body.artists.items[0].id).toBe('4Y9Xp6QpY6Lp9ZkG5R2M8j');
    });

    it('should return 400 for empty query', async () => {
      const req = new NextRequest('http://localhost/api/search?q=');
      const res = await searchGET(req, { params: Promise.resolve({}) } as any);
      expect(res.status).toBe(400);
    });
  });
});
