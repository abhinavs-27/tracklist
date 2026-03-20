import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { searchUsers, enrichUsersWithFollowStatus } from '@/lib/queries';
import { apiBadRequest, apiInternalError, apiOk } from '@/lib/api-response';
import { sanitizeString, clampLimit } from '@/lib/validation';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 50;

export async function GET(request: NextRequest) {
  try {
    const { session, error: authErr } = await requireApiAuth();
    if (authErr) return authErr;

    const { searchParams } = new URL(request.url);
    const raw = searchParams.get('q') ?? '';
    const q = sanitizeString(raw, MAX_QUERY_LENGTH) ?? '';

    if (q.length < MIN_QUERY_LENGTH) {
      return apiBadRequest(`Query must be at least ${MIN_QUERY_LENGTH} characters`);
    }

    const limit = clampLimit(searchParams.get('limit'), 50, 20);

    const rows = await searchUsers(q, limit, session.user.id);
    if (rows.length === 0) return apiOk([]);

    const users = await enrichUsersWithFollowStatus(rows, session.user.id);

    return apiOk(users);
  } catch (e) {
    return apiInternalError(e);
  }
}
