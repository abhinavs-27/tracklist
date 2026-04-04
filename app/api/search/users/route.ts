import { withHandler } from '@/lib/api-handler';
import { apiBadRequest, apiOk } from '@/lib/api-response';
import { getPaginationParams } from '@/lib/api-utils';
import { enrichUsersWithFollowStatus, searchUsers } from '@/lib/queries';
import { sanitizeString } from '@/lib/validation';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 50;

export const GET = withHandler(async (request, { user: me }) => {
  const { searchParams } = request.nextUrl;
  const raw = searchParams.get('q') ?? '';
  const q = sanitizeString(raw, MAX_QUERY_LENGTH) ?? '';

  if (q.length < MIN_QUERY_LENGTH) {
    return apiBadRequest(`Query must be at least ${MIN_QUERY_LENGTH} characters`);
  }

  const { limit } = getPaginationParams(searchParams, 20, 50);

  const rows = await searchUsers(q, limit, me!.id);
  if (rows.length === 0) return apiOk([]);

  const users = await enrichUsersWithFollowStatus(rows, me!.id);

  return apiOk(users);
}, { requireAuth: true });
