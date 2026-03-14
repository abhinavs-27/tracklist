import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getFeedForUser, enrichFeedActivitiesWithEntityNames } from '@/lib/feed';
import { apiUnauthorized, apiInternalError } from '@/lib/api-response';
import { clampLimit, LIMITS } from '@/lib/validation';

/** GET /api/feed?limit=<1-100>&cursor=<ISO timestamp>. Returns { items with spotifyName for reviews, next_cursor }. */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get('limit'), LIMITS.FEED_LIMIT, 50);
    const cursor = searchParams.get('cursor')?.trim() || null;

    const { items, next_cursor } = await getFeedForUser(session.user.id, limit, cursor);
    const enriched = await enrichFeedActivitiesWithEntityNames(items);
    return NextResponse.json({ items: enriched, next_cursor });
  } catch (e) {
    return apiInternalError(e);
  }
}
