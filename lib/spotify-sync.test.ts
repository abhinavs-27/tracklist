import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../app/api/spotify/sync/route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/rate-limit', () => ({
  checkSpotifyRateLimit: vi.fn(() => true),
}));

vi.mock('@/lib/auth', () => ({
  requireApiAuth: vi.fn(async () => ({ id: 'test-user-id' })),
  handleUnauthorized: vi.fn((e) => null),
}));

vi.mock('@/lib/spotify-integration-enabled', () => ({
  isSpotifyIntegrationEnabled: vi.fn(() => true),
}));

vi.mock('@/lib/spotify-user', () => ({
  getValidSpotifyAccessToken: vi.fn(async () => 'mock-token'),
  getRecentlyPlayed: vi.fn(async () => ({
    items: [
      {
        played_at: '2023-01-01T00:00:00Z',
        track: { id: 'track-1' },
      },
    ],
  })),
}));

// We use a factory to get a fresh mock chain for each call to 'from'
function createChain() {
  const chain: any = {
    select: vi.fn().mockImplementation(() => chain),
    eq: vi.fn().mockImplementation(() => chain),
    in: vi.fn().mockImplementation(() => chain),
    insert: vi.fn().mockImplementation(() => chain),
    maybeSingle: vi.fn().mockImplementation(() => chain),
    order: vi.fn().mockImplementation(() => chain),
    limit: vi.fn().mockImplementation(() => chain),
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

vi.mock('@/lib/spotify-cache', () => ({
  getOrFetchTracksBatch: vi.fn(async () => []),
}));

vi.mock('@/lib/community/community-feed-insert', () => ({
  fanOutListenForUserCommunities: vi.fn(async () => {}),
}));

vi.mock('@/lib/profile/recent-activity-cache', () => ({
  bustRecentActivityCacheForUser: vi.fn(),
}));

vi.mock('@/lib/supabase-admin', () => ({
  createSupabaseAdminClient: vi.fn(),
}));

vi.mock('@/lib/taste/enrich-artist-genres', () => ({
  scheduleEnrichArtistGenresForTrackIds: vi.fn(),
}));

// We need to mock the dynamic import of @/lib/queries
vi.mock('@/lib/queries', () => ({
  grantAchievementsOnListen: vi.fn(async () => {}),
}));

describe('Spotify Ingestion (API Route Logic)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should successfully ingest new tracks', async () => {
    // 1. mockSupabase.from('logs').select('track_id').eq('user_id', me.id).in('track_id', trackIds)
    // We need to mock the first 'from' call's result
    const firstChain = createChain();
    const secondChain = createChain();

    mockSupabase.from
      .mockReturnValueOnce(firstChain)
      .mockReturnValueOnce(secondChain);

    firstChain.in.mockResolvedValueOnce({ data: [], error: null });
    secondChain.select.mockResolvedValueOnce({
      data: [{ id: 'log-1', track_id: 'track-1', listened_at: '2023-01-01T00:00:00Z', source: 'spotify' }],
      error: null,
    });

    const request = new NextRequest('http://localhost/api/spotify/sync', { method: 'POST' });
    const response = await POST(request);

    if (response.status !== 200) {
        console.error(await response.json());
    }

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.inserted).toBe(1);
  });

  it('should skip already ingested tracks', async () => {
    const firstChain = createChain();
    mockSupabase.from.mockReturnValueOnce(firstChain);
    firstChain.in.mockResolvedValueOnce({ data: [{ track_id: 'track-1' }], error: null });

    const request = new NextRequest('http://localhost/api/spotify/sync', { method: 'POST' });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.inserted).toBe(0);
    expect(body.skipped).toBe(1);
  });
});
