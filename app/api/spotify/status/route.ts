import { NextRequest } from 'next/server';
import { handleUnauthorized, requireApiAuth } from '@/lib/auth';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { apiInternalError, apiOk, apiTooManyRequests } from '@/lib/api-response';
import { checkSpotifyRateLimit } from '@/lib/rate-limit';
import { isSpotifyIntegrationEnabled } from '@/lib/spotify-integration-enabled';

export type SpotifyStatusResponse = {
  connected: boolean;
  expires_at?: string | null;
};

export async function GET(request: NextRequest) {
  if (!checkSpotifyRateLimit(request)) {
    return apiTooManyRequests();
  }
  try {
    const me = await requireApiAuth(request);

    if (!isSpotifyIntegrationEnabled()) {
      return apiOk({ connected: false } satisfies SpotifyStatusResponse);
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from('spotify_tokens')
      .select('expires_at')
      .eq('user_id', me.id)
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
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}

