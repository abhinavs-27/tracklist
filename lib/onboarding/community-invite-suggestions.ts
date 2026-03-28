import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getCommunityById } from "@/lib/community/queries";
import {
  getInviteLinkByToken,
  isInviteLinkExpired,
} from "@/lib/community/invite-links";
import type { OnboardingSuggestedUser } from "@/lib/onboarding/taste-overlap-suggestions";

const MAX_MEMBERS = 15;

/**
 * Other members of the community invited by `token` (for onboarding step 4).
 */
export async function getCommunityInviteMemberSuggestions(
  viewerId: string,
  token: string,
): Promise<{ communityName: string; users: OnboardingSuggestedUser[] }> {
  const t = token.trim();
  if (!t) return { communityName: "", users: [] };

  const link = await getInviteLinkByToken(t);
  if (!link || isInviteLinkExpired(link)) {
    return { communityName: "", users: [] };
  }

  const community = await getCommunityById(link.community_id);
  const communityName = community?.name ?? "this community";

  const admin = createSupabaseAdminClient();
  const { data: members, error } = await admin
    .from("community_members")
    .select("user_id, created_at")
    .eq("community_id", link.community_id)
    .neq("user_id", viewerId)
    .order("created_at", { ascending: false })
    .limit(MAX_MEMBERS);

  if (error) {
    console.warn("[community-invite-suggestions] members query failed", error);
    return { communityName, users: [] };
  }

  const userIds = (members ?? []).map(
    (r) => (r as { user_id: string }).user_id,
  );
  if (userIds.length === 0) {
    return { communityName, users: [] };
  }

  const { data: users, error: uErr } = await admin
    .from("users")
    .select("id, username, avatar_url")
    .in("id", userIds);

  if (uErr) {
    console.warn("[community-invite-suggestions] users query failed", uErr);
    return { communityName, users: [] };
  }

  const { data: followRows } = await admin
    .from("follows")
    .select("following_id")
    .in("following_id", userIds);

  const followerCount = new Map<string, number>();
  for (const row of followRows ?? []) {
    const id = (row as { following_id: string }).following_id;
    followerCount.set(id, (followerCount.get(id) ?? 0) + 1);
  }

  const byId = new Map(
    ((users ?? []) as { id: string; username: string; avatar_url: string | null }[]).map(
      (u) => [u.id, u] as const,
    ),
  );

  const reason = `Member of “${communityName}”`;
  const ordered = userIds
    .map((id) => byId.get(id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u));

  return {
    communityName,
    users: ordered.map((u) => ({
      id: u.id,
      username: u.username,
      avatar_url: u.avatar_url,
      followers_count: followerCount.get(u.id) ?? 0,
      reasons: [reason],
    })),
  };
}
