import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getFeedForUser } from '@/lib/feed';
import { apiUnauthorized, apiInternalError } from '@/lib/api-response';
import { clampLimit, LIMITS } from '@/lib/validation';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get('limit'), LIMITS.FEED_LIMIT, 50);

    const feed = await getFeedForUser(session.user.id, limit);
    return NextResponse.json(feed);
  } catch (e) {
    return apiInternalError(e);
  }
}
