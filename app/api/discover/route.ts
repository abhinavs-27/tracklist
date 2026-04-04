import { withHandler } from '@/lib/api-handler';
import { apiInternalError, apiOk } from '@/lib/api-response';
import { getUserFromRequest } from '@/lib/auth';
import { enrichUsersWithFollowStatus } from '@/lib/queries';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { clampLimit } from '@/lib/validation';
import type { DiscoverUsersResponse } from '@/types';

export const GET = withHandler(async (request) => {
  const { searchParams } = request.nextUrl;
  const limit = clampLimit(searchParams.get('limit'), 20, 16);

  const supabase = await createSupabaseServerClient();

  const { data: reviews, error: reviewsError } = await supabase
    .from('reviews')
    .select('user_id, entity_id, entity_type, created_at')
    .eq('entity_type', 'album')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit * 10, 50), 80));

  if (reviewsError) return apiInternalError(reviewsError);

  const recentReviews = reviews ?? [];
  const seen = new Set<string>();
  const userIds: string[] = [];
  const latestAlbumByUser = new Map<
    string,
    { album_id: string; created_at: string }
  >();

  for (const r of recentReviews) {
    if (!r?.user_id || !r?.entity_id) continue;
    if (seen.has(r.user_id)) continue;
    seen.add(r.user_id);
    userIds.push(r.user_id);
    latestAlbumByUser.set(r.user_id, {
      album_id: r.entity_id as string,
      created_at: r.created_at,
    });
    if (userIds.length >= limit) break;
  }

  if (userIds.length === 0) {
    const body: DiscoverUsersResponse = { users: [] };
    return apiOk(body);
  }

  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, username, avatar_url, bio, created_at')
    .in('id', userIds);

  if (usersError) return apiInternalError(usersError);

  const viewer = await getUserFromRequest(request);
  const viewerId = viewer?.id ?? null;

  const enrichedUsers = await enrichUsersWithFollowStatus(
    (users ?? []).map((u) => ({
      id: u.id,
      username: u.username,
      avatar_url: u.avatar_url,
      bio: u.bio,
      created_at: u.created_at,
    })),
    viewerId,
  );

  const userMap = new Map(enrichedUsers.map((u) => [u.id, u]));

  const albumUuids = [
    ...new Set(
      [...latestAlbumByUser.values()].map((v) => v.album_id).filter(Boolean),
    ),
  ];
  const spotifyAlbumIdByUuid = new Map<string, string>();
  if (albumUuids.length > 0) {
    const { data: extRows } = await supabase
      .from("album_external_ids")
      .select("album_id, external_id")
      .eq("source", "spotify")
      .in("album_id", albumUuids);
    for (const row of extRows ?? []) {
      const rid = row as { album_id: string; external_id: string };
      spotifyAlbumIdByUuid.set(rid.album_id, rid.external_id);
    }
  }

  const result = userIds
    .map((id) => {
      const u = userMap.get(id);
      if (!u) return null;
      const latest = latestAlbumByUser.get(id);
      const spotifyAlbumId = latest?.album_id
        ? spotifyAlbumIdByUuid.get(latest.album_id) ?? null
        : null;
      return {
        id: u.id,
        username: u.username,
        avatar_url: u.avatar_url,
        latest_album_spotify_id: spotifyAlbumId,
        latest_log_created_at: latest?.created_at ?? null,
        is_following: u.is_following,
        is_viewer: viewerId ? viewerId === u.id : false,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  const body: DiscoverUsersResponse = { users: result };
  return apiOk(body);
});
