import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApiRouter } from '../routes';

// Mock auth before anything else
vi.mock('../lib/auth', () => ({
  getSessionUserId: vi.fn(async () => 'test-user-id'),
  getSession: vi.fn(async () => ({ id: 'test-user-id', username: 'testuser' })),
}));

// Mock Supabase
type ChainResult = { data: unknown; error: unknown; count: number | null };
interface ChainMock {
  select: (...args: unknown[]) => ChainMock;
  eq: (...args: unknown[]) => ChainMock;
  in: (...args: unknown[]) => ChainMock;
  insert: (...args: unknown[]) => ChainMock;
  upsert: (...args: unknown[]) => ChainMock;
  update: (...args: unknown[]) => ChainMock;
  single: (...args: unknown[]) => ChainMock;
  maybeSingle: (...args: unknown[]) => ChainMock;
  order: (...args: unknown[]) => ChainMock;
  limit: (...args: unknown[]) => ChainMock;
  rpc: (...args: unknown[]) => ChainMock;
  range: (...args: unknown[]) => ChainMock;
  lt: (...args: unknown[]) => ChainMock;
  data: unknown;
  error: unknown;
  count: number | null;
  // Ensure that thenable or awaited chain returns the correct shape
  then: (resolve: (result: ChainResult) => unknown) => unknown;
}

function createChain(data: unknown = null, error: unknown = null, count: number | null = null): ChainMock {
  const chain: ChainMock = {
    select: vi.fn().mockImplementation(() => chain),
    eq: vi.fn().mockImplementation(() => chain),
    in: vi.fn().mockImplementation(() => chain),
    insert: vi.fn().mockImplementation(() => chain),
    upsert: vi.fn().mockImplementation(() => chain),
    update: vi.fn().mockImplementation(() => chain),
    single: vi.fn().mockImplementation(() => chain),
    maybeSingle: vi.fn().mockImplementation(() => chain),
    order: vi.fn().mockImplementation(() => chain),
    limit: vi.fn().mockImplementation(() => chain),
    rpc: vi.fn().mockImplementation(() => chain),
    range: vi.fn().mockImplementation(() => chain),
    lt: vi.fn().mockImplementation(() => chain),
    data,
    error,
    count,
    then: (resolve) => resolve({ data, error, count }),
  };
  return chain;
}

const mockSupabase = {
  from: vi.fn(),
  rpc: vi.fn(),
};

vi.mock('../lib/supabase', () => ({
  getSupabase: vi.fn(() => mockSupabase),
  isSupabaseConfigured: vi.fn(() => true),
}));

// Mock Spotify
vi.mock('../lib/spotify', () => ({
  getTrack: vi.fn(async (id) => ({
    id,
    name: 'Test Track',
    artists: [{ name: 'Test Artist', id: 'artist-id' }],
    album: { name: 'Test Album', id: 'album-id', images: [{ url: 'http://image.url' }], release_date: '2023-01-01' },
    duration_ms: 120000,
  })),
  searchSpotify: vi.fn(async (q) => ({
    artists: { items: [{ id: 'a1', name: 'Test Artist' }] },
    albums: { items: [] },
    tracks: { items: [] },
  })),
}));

// Mock internal services
vi.mock('../services/reviewsService', () => ({
  getReviewsForEntity: vi.fn(async () => ({
    reviews: [],
    average_rating: 0,
    count: 0,
    my_review: null,
  })),
}));

vi.mock('../services/statsService', () => ({
  getEntityStats: vi.fn(async () => ({
    average_rating: 4.5,
    listen_count: 100,
    review_count: 10,
    rating_distribution: {},
  })),
}));

vi.mock('../services/userSearchService', () => ({
  searchUsers: vi.fn(async (q) => {
    if (q === 'test') return [{ id: 'test-user-id', username: 'testuser' }];
    return [];
  }),
}));

vi.mock('../services/followService', () => ({
  enrichUsersWithFollowStatus: vi.fn(
    async (users: { id: string; username: string; avatar_url: string | null }[]) =>
      users.map((u) => ({ ...u, following: false })),
  ),
}));

vi.mock('../lib/rateLimit', () => ({
  checkSpotifyRateLimit: vi.fn(() => true),
}));

vi.mock('../lib/spotify-integration-enabled', () => ({
  isSpotifyIntegrationEnabled: vi.fn(() => true),
}));

const app = express();
app.use(express.json());
app.use('/api', createApiRouter());

describe('Backend Critical Flows: API Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/reviews', () => {
    it('should successfully create a review', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'reviews') {
          return createChain({ id: 'r1', user_id: 'test-user-id', entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 5, review_text: 'Great!', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        }
        if (table === 'users') {
          return createChain({ id: 'test-user-id', username: 'testuser', avatar_url: null });
        }
        return createChain();
      });

      const res = await request(app)
        .post('/api/reviews')
        .send({ entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 5, review_text: 'Great!' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('r1');
      expect(res.body.username).toBe('testuser');
    });

    it('should return 400 for invalid rating', async () => {
      const res = await request(app)
        .post('/api/reviews')
        .send({ entity_type: 'album', entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx', rating: 6 });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/users/:username', () => {
    it('should fetch user profile', async () => {
      mockSupabase.from.mockImplementation((table) => {
        if (table === 'users') {
          return createChain({ id: 'test-user-id', username: 'testuser', avatar_url: null, bio: 'Test Bio', created_at: new Date().toISOString() });
        }
        if (table === 'follows') {
          return createChain([], null, 42);
        }
        if (table === 'reviews') {
          return createChain([], null, 10);
        }
        if (table === 'user_streaks') {
          return createChain({ current_streak: 5, longest_streak: 10 });
        }
        return createChain();
      });

      const res = await request(app).get('/api/users/testuser');
      expect(res.status).toBe(200);
      expect(res.body.username).toBe('testuser');
      expect(res.body.followers_count).toBe(42);
    });
  });

  describe('GET /api/search', () => {
    it('should return search results', async () => {
      const res = await request(app).get('/api/search?q=test');
      expect(res.status).toBe(200);
      expect(res.body.artists.items.length).toBeGreaterThan(0);
      expect(res.body.artists.items[0].name).toBe('Test Artist');
    });
  });

  describe('GET /api/search/users', () => {
    it('should return user search results', async () => {
      const res = await request(app).get('/api/search/users?q=test');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0].username).toBe('testuser');
    });
  });

  describe('GET /api/spotify/song/:id', () => {
    it('should fetch song data from Spotify', async () => {
      const res = await request(app).get('/api/spotify/song/2nLhD10Z7Sb4RFyCX2ZCyx');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Test Track');
    });
  });
});
