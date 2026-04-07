import { NextRequest } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { enrichUsersWithFollowStatus } from '@/lib/queries';
import { apiBadRequest, apiInternalError, apiOk } from '@/lib/api-response';
import { clampLimit } from '@/lib/validation';
import type { DiscoverUsersResponse } from '@/types';

import { withHandler } from '@/lib/api-handler';
import { getPaginationParams } from '@/lib/api-utils';

export const GET = withHandler(async (request: NextRequest) => {
  try {
    const { searchParams } = request.nextUrl;
    const { limit } = getPaginationParams(searchParams, 16, 20);

    const supabase = await createSupabaseServerClient();

    const reviewsPromise = supabase
      .from('reviews')
      .select('user_id, entity_id, entity_type, created_at')
      .eq('entity_type', 'album')
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit * 10, 50), 80));

    const viewerPromise = getUserFromRequest(request);

    const [reviewsRes, viewer] = await Promise.all([
      reviewsPromise,
      viewerPromise,
    ]);

    if (reviewsRes.error) return apiInternalError(reviewsRes.error);
    const reviews = reviewsRes.data;

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

    // Parallelize independent fetches: users and album external IDs.
    const viewerId = viewer?.id ?? null;

    // Parallelize independent fetches: users, album external IDs, and follow status.
    const [usersRes, albumExternalIdsRes, followsRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, username, avatar_url, bio, created_at")
        .in("id", userIds),
      (async () => {
        const albumUuids = [
          ...new Set(
            [...latestAlbumByUser.values()]
              .map((v) => v.album_id)
              .filter(Boolean),
          ),
        ];
        if (albumUuids.length === 0)
          return {
            data: [] as { album_id: string; external_id: string }[],
          };
        return supabase
          .from("album_external_ids")
          .select("album_id, external_id")
          .eq("source", "spotify")
          .in("album_id", albumUuids);
      })(),
      viewerId
        ? supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", viewerId)
            .in("following_id", userIds)
        : Promise.resolve({ data: [] as { following_id: string }[] }),
    ]);

    if (usersRes.error) return apiInternalError(usersRes.error);

    const users = usersRes.data ?? [];
    const followingSet = new Set(
      (followsRes.data ?? []).map((f) => f.following_id),
    );

    const enrichedUsers = users.map((u) => ({
      id: u.id,
      username: u.username,
      avatar_url: u.avatar_url,
      bio: u.bio,
      created_at: u.created_at,
      is_following: followingSet.has(u.id),
    }));

    const userMap = new Map(enrichedUsers.map((u) => [u.id, u]));

    const spotifyAlbumIdByUuid = new Map<string, string>();
    for (const row of albumExternalIdsRes.data ?? []) {
      const rid = row as { album_id: string; external_id: string };
      spotifyAlbumIdByUuid.set(rid.album_id, rid.external_id);
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
  } catch (e) {
    if (e instanceof TypeError) return apiBadRequest('Invalid request');
    return apiInternalError(e);
  }
});
