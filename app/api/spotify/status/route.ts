import { NextRequest } from 'next/server';
import { withHandler } from '@/lib/api-handler';
import { createSupabaseAdminClient } from '@/lib/supabase-admin';
import { apiOk, apiTooManyRequests } from '@/lib/api-response';
import { checkSpotifyRateLimit } from '@/lib/rate-limit';
import { isSpotifyIntegrationEnabled } from '@/lib/spotify-integration-enabled';

export type SpotifyStatusResponse = {
  connected: boolean;
  expires_at?: string | null;
};

export const GET = withHandler(async (request: NextRequest, { user: me }) => {
  if (!checkSpotifyRateLimit(request)) {
    return apiTooManyRequests();
  }

  if (!isSpotifyIntegrationEnabled()) {
    return apiOk({ connected: false } satisfies SpotifyStatusResponse);
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from('spotify_tokens')
    .select('expires_at')
    .eq('user_id', me!.id)
    .single();

  if (error) {
    // If not found, treat as not connected.
    return apiOk({ connected: false } satisfies SpotifyStatusResponse);
  }

  return apiOk({
    connected: true,
    expires_at: data?.expires_at ?? null,
  } satisfies SpotifyStatusResponse);
}, { requireAuth: true });
