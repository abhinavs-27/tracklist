import { withHandler } from "@/lib/api-handler";

export const maxDuration = 30;
import { apiOk } from "@/lib/api-response";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getUserFavoriteAlbums, getUserLists, getFollowCounts, getUserStreak } from "@/lib/queries";
import { getCachedRecentAlbumsFromLogs } from "@/lib/profile/recent-activity-cache";

export const GET = withHandler(
  async (_request, { user }) => {
    const uid = user!.id;
    const admin = createSupabaseAdminClient();

    const [userRowRes, followCountsRes, favoritesRes, listsRes, recentRes, streakRes, reviewCountRes] =
      await Promise.allSettled([
        admin
          .from("users")
          .select(
            "id, username, avatar_url, bio, created_at, lastfm_username, lastfm_last_synced_at",
          )
          .eq("id", uid)
          .maybeSingle(),
        getFollowCounts(uid),
        getUserFavoriteAlbums(uid, 10),
        getUserLists(uid, 50),
        getCachedRecentAlbumsFromLogs(uid, 48, false),
        getUserStreak(uid),
        admin
          .from("reviews")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid),
      ]);

    const userRow =
      userRowRes.status === "fulfilled" ? userRowRes.value.data : null;
    const followCounts =
      followCountsRes.status === "fulfilled"
        ? followCountsRes.value
        : { followers_count: 0, following_count: 0 };
    const favorites =
      favoritesRes.status === "fulfilled" ? favoritesRes.value : [];
    const lists = listsRes.status === "fulfilled" ? listsRes.value : [];
    const recentAlbums =
      recentRes.status === "fulfilled" ? recentRes.value : [];
    const streak =
      streakRes.status === "fulfilled" ? streakRes.value : null;
    const review_count =
      reviewCountRes.status === "fulfilled" ? (reviewCountRes.value.count ?? 0) : 0;

    const profileUser = userRow
      ? {
          id: uid,
          username: userRow.username,
          avatar_url: userRow.avatar_url ?? null,
          bio: userRow.bio ?? null,
          created_at: userRow.created_at,
          lastfm_username: userRow.lastfm_username ?? null,
          lastfm_last_synced_at: userRow.lastfm_last_synced_at ?? null,
          followers_count: followCounts.followers_count ?? 0,
          following_count: followCounts.following_count ?? 0,
          is_following: false,
          is_own_profile: true,
          review_count,
          streak: streak
            ? {
                current_streak: streak.current_streak,
                longest_streak: streak.longest_streak,
                last_listen_date: streak.last_listen_date ?? null,
              }
            : null,
        }
      : null;

    return apiOk({
      user: profileUser,
      favorites,
      lists,
      recentAlbums,
    });
  },
  { requireAuth: true },
);
