import { NextRequest } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { apiUnauthorized, apiInternalError, apiOk, apiTooManyRequests } from '@/lib/api-response';
import { checkSpotifyRateLimit } from '@/lib/rate-limit';

export type SpotifyStatusResponse = {
  connected: boolean;
  expires_at?: string | null;
};

export async function GET(request: NextRequest) {
  if (!checkSpotifyRateLimit(request)) {
    return apiTooManyRequests();
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
      return apiOk({ connected: false } satisfies SpotifyStatusResponse);
    }

    return apiOk({
      connected: true,
      expires_at: data?.expires_at ?? null,
    } satisfies SpotifyStatusResponse);
  } catch (e) {
    return apiInternalError(e);
  }
}

