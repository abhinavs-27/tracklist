import { NextRequest } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { searchUsers, enrichUsersWithFollowStatus } from '@/lib/queries';
import { apiBadRequest, apiOk } from '@/lib/api-response';
import { sanitizeString, clampLimit } from '@/lib/validation';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 50;

export const GET = withHandler(
  async (request: NextRequest, { user: me }) => {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get('q') ?? '';
    const q = sanitizeString(raw, MAX_QUERY_LENGTH) ?? '';

    if (q.length < MIN_QUERY_LENGTH) {
      return apiBadRequest(`Query must be at least ${MIN_QUERY_LENGTH} characters`);
    }

    const limit = clampLimit(searchParams.get('limit'), 50, 20);

    const rows = await searchUsers(q, limit, me!.id);
    if (rows.length === 0) return apiOk([]);

    const users = await enrichUsersWithFollowStatus(rows, me!.id);

    return apiOk(users);
  },
  { requireAuth: true }
);
