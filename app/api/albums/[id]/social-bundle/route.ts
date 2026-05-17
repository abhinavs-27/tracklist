import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getAlbumFriendLeaderboard } from "@/lib/queries";

export const GET = withHandler(
  async (_request, ctx) => {
    const { id } = ctx.params;
    if (!id || !isValidUuid(id)) return apiBadRequest("Invalid album id");

    const uid = ctx.user?.id ?? null;
    const supabase = createSupabaseAdminClient();

    const [leaderboardRes, myReviewRes, friendActivityRes] =
      await Promise.allSettled([
        uid ? getAlbumFriendLeaderboard(uid, id) : Promise.resolve([]),
        uid
          ? supabase
              .from("reviews")
              .select("id, rating, review_text")
              .eq("entity_type", "album")
              .eq("entity_id", id)
              .eq("user_id", uid)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        uid
          ? (async () => {
              const { data: trackRows } = await supabase
                .from("tracks").select("id").eq("album_id", id).limit(1000);
              const trackIds = (trackRows ?? []).map((t) => t.id as string);
              if (!trackIds.length) return [];

              const { data: followRows } = await supabase
                .from("follows").select("following_id").eq("follower_id", uid).limit(500);
              const followingIds = (followRows ?? []).map((f) => f.following_id as string);
              if (!followingIds.length) return [];

              const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
              const { data: logs } = await supabase
                .from("logs").select("user_id, listened_at")
                .in("track_id", trackIds).in("user_id", followingIds)
                .gte("listened_at", thirtyDaysAgo)
                .order("listened_at", { ascending: false }).limit(100);
              if (!logs?.length) return [];

              const seen = new Set<string>();
              const onePerUser = (logs as { user_id: string; listened_at: string }[])
                .filter((l) => { if (seen.has(l.user_id)) return false; seen.add(l.user_id); return true; })
                .slice(0, 10);

              const userIds = onePerUser.map((l) => l.user_id);
              const [usersRes, reviewsRes] = await Promise.all([
                supabase.from("users").select("id, username, avatar_url").in("id", userIds),
                supabase.from("reviews").select("user_id, rating")
                  .eq("entity_type", "album").eq("entity_id", id).in("user_id", userIds),
              ]);
              const userMap = new Map(
                ((usersRes.data ?? []) as { id: string; username: string; avatar_url: string | null }[])
                  .map((u) => [u.id, u]),
              );
              const ratingMap = new Map(
                ((reviewsRes.data ?? []) as { user_id: string; rating: number }[])
                  .map((r) => [r.user_id, r.rating]),
              );
              return onePerUser
                .map((l) => {
                  const user = userMap.get(l.user_id);
                  if (!user) return null;
                  return {
                    user_id: l.user_id,
                    username: user.username,
                    avatar_url: user.avatar_url ?? null,
                    listened_at: l.listened_at,
                    rating: ratingMap.get(l.user_id) ?? null,
                  };
                })
                .filter(Boolean);
            })()
          : Promise.resolve([]),
      ]);

    const leaderboard = leaderboardRes.status === "fulfilled" ? (leaderboardRes.value ?? []) : [];
    const myReviewRow =
      myReviewRes.status === "fulfilled" && "data" in myReviewRes.value
        ? myReviewRes.value.data
        : null;
    const friendActivity =
      friendActivityRes.status === "fulfilled" ? friendActivityRes.value : [];

    return apiOk({
      leaderboard,
      myReview: myReviewRow
        ? { id: myReviewRow.id, rating: myReviewRow.rating, review_text: myReviewRow.review_text ?? null }
        : null,
      friendActivity,
    });
  },
  { requireAuth: false },
);
