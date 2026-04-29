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
  requireApiAuth: vi.fn(async () => ({ id: 'api-test-user-id', username: 'apitestuser' })),
  getUserFromRequest: vi.fn(async () => ({ id: 'viewer-id' })),
  handleUnauthorized: vi.fn(() => null),
}));

function createChain() {
  const chain: any = {
    rpc: vi.fn().mockImplementation(() => chain),
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
  rpc: vi.fn(() => {
    activeChain = createChain();
    return activeChain;
  }),
};

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(async () => mockSupabase),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdminClient: vi.fn(() => mockSupabase),
}));

vi.mock('@/lib/spotify', () => ({
  searchSpotify: vi.fn(async (q) => ({
    artists: { items: [{ id: 'a1', name: 'API Test Artist' }] },
    albums: { items: [] },
    tracks: { items: [] },
  })),
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

vi.mock('@/lib/catalog/non-blocking-enrichment', () => ({
  scheduleTrackEnrichmentBatch: vi.fn(),
  scheduleTrackEnrichment: vi.fn(),
  scheduleAlbumEnrichment: vi.fn(),
  scheduleArtistEnrichment: vi.fn(),
}));

vi.mock('@/lib/catalog/entity-resolution', () => ({
  getTrackIdByExternalId: vi.fn(async () => 't1'),
  getAlbumIdByExternalId: vi.fn(async () => 'a1'),
  getArtistIdByExternalId: vi.fn(async () => 'ar1'),
}));

vi.mock('@/lib/taste/enrich-artist-genres', () => ({
  scheduleEnrichArtistGenresForTrackIds: vi.fn(),
}));

vi.mock('@/lib/community/community-feed-insert', () => ({
  fanOutReviewForUserCommunities: vi.fn(),
  fanOutListenForUserCommunities: vi.fn(),
}));

vi.mock('@/lib/profile/recent-activity-cache', () => ({
  bustRecentActivityCacheForUser: vi.fn(),
}));

vi.mock('@/lib/queries', () => ({
  grantAchievementOnReview: vi.fn(),
  grantAchievementsOnListen: vi.fn(),
  fetchUserSummary: vi.fn(async (userId) => ({ id: userId, username: 'apitestuser', avatar_url: null })),
  getFullUserProfile: vi.fn(async (username) => {
    if (username === 'apitestuser') return { id: 'api-test-user-id', username: 'apitestuser', bio: 'API bio' };
    return null;
  }),
  getReviewsForEntity: vi.fn(),
}));

vi.mock('@/lib/feed/generate-events', () => ({
  recordRatingFeedEvent: vi.fn(),
}));

describe('Critical Flows: API Logic Integration (Vitest)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/reviews', () => {
    it('should create a review successfully', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);
      chain.single.mockResolvedValue({
        data: { id: 'r1', entity_type: 'album', entity_id: 'a1', rating: 5, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        error: null
      });

      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 5, review_text: 'API Test' }),
      });

      const res = await reviewPOST(req, { params: Promise.resolve({}) } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('r1');
      expect(body.rating).toBe(5);
    });
  });

  describe('POST /api/logs', () => {
    it('should log a listen successfully', async () => {
      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);
      chain.single.mockResolvedValue({
        data: { id: 'l1', track_id: 't1', listened_at: new Date().toISOString() },
        error: null
      });

      const req = new NextRequest('http://localhost/api/logs', {
        method: 'POST',
        body: JSON.stringify({ track_id: '2nLhD10Z7Sb4RFyCX2ZCyx', source: 'manual' }),
      });

      const res = await logPOST(req, { params: Promise.resolve({}) } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe('l1');
    });
  });

  describe('POST /api/spotify/sync', () => {
    it('should sync from spotify successfully', async () => {
      const firstChain = createChain();
      const secondChain = createChain();
      mockSupabase.from
        .mockReturnValueOnce(firstChain) // existing check
        .mockReturnValueOnce(secondChain); // insert select

      firstChain.in.mockResolvedValue({ data: [], error: null });
      secondChain.select.mockResolvedValue({ data: [{ id: 'l1', track_id: 's1', listened_at: new Date().toISOString(), source: 'spotify' }], error: null });

      const req = new NextRequest('http://localhost/api/spotify/sync', { method: 'POST' });
      const res = await syncPOST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.inserted).toBe(1);
    });
  });

  describe('GET /api/users/[username]', () => {
    it('should fetch user profile successfully', async () => {
      const req = new NextRequest('http://localhost/api/users/apitestuser');
      const res = await userGET(req, { params: Promise.resolve({ username: 'apitestuser' }) } as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.username).toBe('apitestuser');
    });

    it('should return 404 for missing user', async () => {
      const req = new NextRequest('http://localhost/api/users/missing');
      const res = await userGET(req, { params: Promise.resolve({ username: 'missing' }) } as any);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/search', () => {
    it('should return search results successfully', async () => {
      const req = new NextRequest('http://localhost/api/search?q=test');
      const res = await searchGET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.artists.items[0].name).toBe('API Test Artist');
    });

    it('should return 400 for empty query', async () => {
      const req = new NextRequest('http://localhost/api/search?q= ');
      const res = await searchGET(req);
      expect(res.status).toBe(400);
    });
  });
});
