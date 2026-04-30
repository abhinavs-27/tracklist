import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { POST as reviewPOST, GET as reviewGET } from '../app/api/reviews/route';
import { POST as logPOST } from '../app/api/logs/route';
import { POST as syncPOST } from '../app/api/spotify/sync/route';
import { GET as userGET } from '../app/api/users/[username]/route';
import { GET as searchGET } from '../app/api/search/route';

// --- Mocks ---

vi.mock('@/lib/auth', () => ({
  requireApiAuth: vi.fn(async () => ({ id: '550e8400-e29b-41d4-a716-446655440000', username: 'autotester' })),
  getUserFromRequest: vi.fn(async () => ({ id: '550e8400-e29b-41d4-a716-446655440001' })),
  handleUnauthorized: vi.fn((e: any) => {
    if (e.status === 401) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
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
      artists: { items: [{ id: '1234567890123456789012', name: 'Test Artist' }] },
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
  getTrackIdByExternalId: vi.fn(async () => '550e8400-e29b-41d4-a716-446655440002'),
  getAlbumIdByExternalId: vi.fn(async () => '550e8400-e29b-41d4-a716-446655440003'),
  getArtistIdByExternalId: vi.fn(async () => '550e8400-e29b-41d4-a716-446655440004'),
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
  fetchUserSummary: vi.fn(async (userId) => ({ id: userId, username: 'autotester', avatar_url: null })),
  getFullUserProfile: vi.fn(async (username) => {
    if (username === 'autotester') {
        return { id: '550e8400-e29b-41d4-a716-446655440000', username: 'autotester', bio: 'Test bio' };
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
    items: [{ played_at: new Date().toISOString(), track: { id: '1234567890123456789012' } }],
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

describe('Automated API Logic: Integration Tests (Vitest)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/reviews', () => {
    it('should successfully create/upsert a review', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);
      chain.single.mockResolvedValueOnce({
          data: {
            id: '550e8400-e29b-41d4-a716-446655440005',
            entity_type: 'album',
            entity_id: '1234567890123456789012',
            rating: 4.5,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          error: null
      });

      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({
          entity_type: 'album',
          entity_id: '1234567890123456789012',
          rating: 4.5,
          review_text: 'Excellent automated test.'
        }),
      });

      const res = await reviewPOST(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('550e8400-e29b-41d4-a716-446655440005');
      expect(body.rating).toBe(4.5);
    });

    it('should return 400 for invalid rating bounds', async () => {
        const req = new NextRequest('http://localhost/api/reviews', {
          method: 'POST',
          body: JSON.stringify({
            entity_type: 'album',
            entity_id: '1234567890123456789012',
            rating: 6
          }),
        });
        const res = await reviewPOST(req, { params: Promise.resolve({}) });
        expect(res.status).toBe(400);
    });
  });

  describe('POST /api/logs', () => {
    it('should successfully log a listen', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);
      chain.single.mockResolvedValue({
        data: {
          id: '550e8400-e29b-41d4-a716-446655440006',
          track_id: '550e8400-e29b-41d4-a716-446655440002',
          listened_at: new Date().toISOString()
        },
        error: null
      });

      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({
          track_id: '1234567890123456789012',
          source: 'manual'
        }),
      });

      const res = await logPOST(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('550e8400-e29b-41d4-a716-446655440006');
    });

    it('should return 503 if catalog is pending', async () => {
        const { getTrackIdByExternalId } = await import('@/lib/catalog/entity-resolution');
        vi.mocked(getTrackIdByExternalId).mockResolvedValueOnce(null);

        const req = new NextRequest('http://localhost/api/logs', {
          method: 'POST',
          body: JSON.stringify({
            track_id: '1234567890123456789012',
            source: 'manual'
          }),
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
        secondChain.select.mockResolvedValue({ data: [{ id: '550e8400-e29b-41d4-a716-446655440007' }], error: null });

        const req = new NextRequest('http://localhost/api/spotify/sync', { method: 'POST' });
        const res = await syncPOST(req, { params: Promise.resolve({}) });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.inserted).toBe(1);
    });
  });

  describe('GET /api/users/[username]', () => {
    it('should fetch a user profile', async () => {
      const req = new NextRequest('http://localhost/api/users/autotester');
      const res = await userGET(req, { params: Promise.resolve({ username: 'autotester' }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe('autotester');
    });

    it('should return 404 for missing user', async () => {
        const req = new NextRequest('http://localhost/api/users/missing');
        const res = await userGET(req, { params: Promise.resolve({ username: 'missing' }) });
        expect(res.status).toBe(404);
    });
  });

  describe('GET /api/search', () => {
    it('should return search results', async () => {
      const req = new NextRequest('http://localhost/api/search?q=radiohead');
      const res = await searchGET(req, { params: Promise.resolve({}) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.artists.items.length).toBeGreaterThan(0);
      expect(body.artists.items[0].name).toBe('Test Artist');
    });

    it('should return 400 for empty query', async () => {
        const req = new NextRequest('http://localhost/api/search?q=');
        const res = await searchGET(req, { params: Promise.resolve({}) });
        expect(res.status).toBe(400);
    });
  });
});
