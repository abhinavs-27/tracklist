
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { getUserFromRequest } from './requireApiAuth';
import { getSession } from './get-session';

vi.mock('./get-session', () => ({
  getSession: vi.fn(),
}));

describe('getUserFromRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user from session ID without DB lookup when ID is present', async () => {
    const mockSession = {
      user: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'test@example.com',
        name: 'Test User',
        username: 'testuser',
        avatar_url: 'http://example.com/avatar.png',
        onboarding_completed: true,
      },
    };
    (getSession as any).mockResolvedValue(mockSession);

    const user = await getUserFromRequest();

    expect(user).toEqual({
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      username: 'testuser',
      avatar_url: 'http://example.com/avatar.png',
      bio: null,
      created_at: undefined,
    });
  });

  it('returns null when no session and no auth header', async () => {
    (getSession as any).mockResolvedValue(null);
    const user = await getUserFromRequest();
    expect(user).toBeNull();
  });
});
