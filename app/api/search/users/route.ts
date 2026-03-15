import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { searchUsers } from '@/lib/queries';
import { createSupabaseServerClient } from '@/lib/supabase-server';
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

    const supabase = await createSupabaseServerClient();
    const { data: followRows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', session.user.id)
      .in('following_id', rows.map((r) => r.id));
    const followingSet = new Set((followRows ?? []).map((f) => f.following_id));

    const users = rows.map((r) => ({
      id: r.id,
      username: r.username,
      avatar_url: r.avatar_url,
      followers_count: r.followers_count,
      is_following: followingSet.has(r.id),
    }));
    return apiOk(users);
  } catch (e) {
    return apiInternalError(e);
  }
}
