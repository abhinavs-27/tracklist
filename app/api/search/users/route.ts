import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { searchUsers, enrichUsersWithFollowStatus } from '@/lib/queries';
import { apiUnauthorized, apiBadRequest, apiInternalError, apiOk } from '@/lib/api-response';
import { sanitizeString } from '@/lib/validation';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 50;

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { searchParams } = new URL(request.url);
    const raw = searchParams.get('q') ?? '';
    const q = sanitizeString(raw, MAX_QUERY_LENGTH) ?? '';

    if (q.length < MIN_QUERY_LENGTH) {
      return apiBadRequest(`Query must be at least ${MIN_QUERY_LENGTH} characters`);
    }

    const rows = await searchUsers(q, 20, session.user.id);
    if (rows.length === 0) return apiOk([]);

    const users = await enrichUsersWithFollowStatus(rows, session.user.id);

    return apiOk(users);
  } catch (e) {
    return apiInternalError(e);
  }
}
