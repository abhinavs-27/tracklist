import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { apiUnauthorized, apiInternalError } from '@/lib/api-response';
import { checkSpotifyRateLimit } from '@/lib/rate-limit';

export type SpotifyStatusResponse = {
  connected: boolean;
  expires_at?: string | null;
};

export async function GET(request: NextRequest) {
  if (!checkSpotifyRateLimit(request)) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('spotify_tokens')
      .select('expires_at')
      .eq('user_id', session.user.id)
      .single();

    if (error) {
      // If not found, treat as not connected.
      return NextResponse.json({ connected: false } satisfies SpotifyStatusResponse);
    }

    return NextResponse.json({
      connected: true,
      expires_at: data?.expires_at ?? null,
    } satisfies SpotifyStatusResponse);
  } catch (e) {
    return apiInternalError(e);
  }
}

