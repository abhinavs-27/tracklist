import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';
import { POST as reviewPOST } from '../app/api/reviews/route';
import { POST as logPOST } from '../app/api/logs/route';
import { GET as searchGET } from '../app/api/search/route';
import { POST as syncPOST } from '../app/api/spotify/sync/route';
import { LIMITS } from './validation';

// --- Mocks ---

vi.mock('@/lib/auth', () => ({
  requireApiAuth: vi.fn(async () => ({ id: 'test-user-id', username: 'testuser' })),
  getUserFromRequest: vi.fn(async () => ({ id: 'viewer-id' })),
  handleUnauthorized: vi.fn((e) => {
    if (e && e.status === 401) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
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
    rpc: vi.fn().mockImplementation(() => chain),
  };
  return chain;
}

let activeChain: any;
const mockSupabase = {
  from: vi.fn(() => {
    activeChain = createChain();
    return activeChain;
  }),
  rpc: vi.fn(() => createChain()),
};

vi.mock('@/lib/supabase-server', () => ({
  createSupabaseServerClient: vi.fn(async () => mockSupabase),
}));

// Mock internal helpers
vi.mock('@/lib/queries', () => ({
  grantAchievementOnReview: vi.fn(),
  grantAchievementsOnListen: vi.fn(),
  getReviewsForEntity: vi.fn(),
  fetchUserSummary: vi.fn(async (userId) => ({ id: userId, username: 'testuser', avatar_url: null })),
  getFullUserProfile: vi.fn(),
  getListenLogsForUser: vi.fn(),
}));

vi.mock('@/lib/catalog/entity-resolution', () => ({
  resolveEntityWithPending: vi.fn(async () => 'track-uuid'),
  getTrackIdByExternalId: vi.fn(async () => 'track-uuid'),
}));

vi.mock('@/lib/catalog/non-blocking-enrichment', () => ({
  scheduleTrackEnrichment: vi.fn(),
  scheduleAlbumEnrichment: vi.fn(),
  scheduleArtistEnrichment: vi.fn(),
  scheduleTrackEnrichmentBatch: vi.fn(),
}));

vi.mock('@/lib/feed/generate-events', () => ({
  recordRatingFeedEvent: vi.fn(),
}));

vi.mock('@/lib/community/community-feed-insert', () => ({
  fanOutReviewForUserCommunities: vi.fn(),
  fanOutListenForUserCommunities: vi.fn(),
}));

vi.mock('@/lib/spotify', () => ({
  searchSpotify: vi.fn(async () => ({
    artists: { items: [{ id: 'a1', name: 'Test Artist' }] },
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

vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdminClient: vi.fn(() => mockSupabase),
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

  describe('Review Creation Logic', () => {
    it('should truncate review text that exceeds LIMITS.REVIEW_CONTENT', async () => {
      const longText = 'a'.repeat(LIMITS.REVIEW_CONTENT + 100);
      const expectedText = 'a'.repeat(LIMITS.REVIEW_CONTENT);

      const chain = createChain();
      mockSupabase.from.mockReturnValue(chain);
      chain.select.mockReturnValue(chain);
      chain.single.mockResolvedValueOnce({
        data: { id: 'r1', entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 5, review_text: expectedText, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
        error: null
      });

      const req = new NextRequest('http://localhost/api/reviews', {
        method: 'POST',
        body: JSON.stringify({ entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 5, review_text: longText }),
      });

      const res = await reviewPOST(req, { user: { id: 'test-user-id' } } as any);
      expect(res.status).toBe(200);

      // Verify truncation happened before DB call
      expect(chain.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          review_text: expectedText
        }),
        expect.any(Object)
      );
    });

    it('should return 401 if user is not authenticated', async () => {
        const { requireApiAuth } = await import('@/lib/auth');
        vi.mocked(requireApiAuth).mockRejectedValueOnce({ status: 401 });

        const req = new NextRequest('http://localhost/api/reviews', {
          method: 'POST',
          body: JSON.stringify({ entity_type: 'album', entity_id: 'a1', rating: 5 }),
        });

        const res = await reviewPOST(req, { user: null } as any);
        expect(res.status).toBe(401);
    });
  });

  describe('Search Parameter Validation', () => {
    it('should clamp limit parameter to LIMITS.SEARCH_LIMIT', async () => {
      const req = new NextRequest(`http://localhost/api/search?q=radiohead&limit=${LIMITS.SEARCH_LIMIT + 10}`);
      const res = await searchGET(req);
      expect(res.status).toBe(200);

      const { searchSpotify } = await import('@/lib/spotify');
      expect(searchSpotify).toHaveBeenCalledWith(
        'radiohead',
        expect.any(Array),
        LIMITS.SEARCH_LIMIT
      );
    });
  });

  describe('Listen Logging Logic', () => {
    it('should successfully log a listen and call fanOut', async () => {
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

        const { grantAchievementsOnListen } = await import('@/lib/queries');
        expect(grantAchievementsOnListen).toHaveBeenCalledWith('test-user-id');
    });
  });

  describe('Spotify Ingestion Logic', () => {
    it('should successfully ingest from spotify recently played', async () => {
        const firstChain = createChain();
        const secondChain = createChain();
        mockSupabase.from
          .mockReturnValueOnce(firstChain) // logs.select
          .mockReturnValueOnce(secondChain); // logs.insert

        firstChain.in.mockResolvedValue({ data: [], error: null });
        secondChain.select.mockResolvedValue({ data: [{ id: 'l1', track_id: 's1', listened_at: new Date().toISOString(), source: 'spotify' }], error: null });

        const req = new NextRequest('http://localhost/api/spotify/sync', { method: 'POST' });
        const res = await syncPOST(req);

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.inserted).toBe(1);

        const { fanOutListenForUserCommunities } = await import('@/lib/community/community-feed-insert');
        expect(fanOutListenForUserCommunities).toHaveBeenCalled();
    });
  });
});
