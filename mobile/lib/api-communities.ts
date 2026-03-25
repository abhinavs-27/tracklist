import type {
  CommunityInvitePending,
  CommunityRow,
  CommunityWithMeta,
} from "../../types";
import { fetcher } from "./api";

/** Mirrors `CommunityLeaderboardRow` from server `getWeeklyLeaderboard`. */
export type CommunityLeaderboardRow = {
  userId: string;
  username: string;
  avatar_url: string | null;
  totalLogs: number;
  uniqueArtists: number;
  streakDays: number;
};

/** Mirrors server `CommunityFeedItemV2` from `getCommunityFeedV2`. */
export type CommunityFeedItemV2 = {
  id: string;
  community_id: string;
  user_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  username: string;
  avatar_url: string | null;
  label: string;
  sublabel: string | null;
  artwork_url: string | null;
  badge:
    | "streak"
    | "review"
    | "list"
    | "listen"
    | "member"
    | "follow"
    | null;
  entity_type?: "album" | "song" | null;
  entity_id?: string | null;
  entity_name?: string | null;
  entity_href?: string | null;
  review_id?: string | null;
  log_id?: string | null;
  comment_count?: number;
};

export type CommunitiesListResponse = {
  communities: CommunityWithMeta[];
};

export type CommunityDetailResponse = {
  community: CommunityRow;
  member_count: number;
  is_member: boolean;
  my_role: "owner" | "member" | null;
  pending_invite_id: string | null;
};

export type CommunityLeaderboardResponse = {
  leaderboard: CommunityLeaderboardRow[];
};

export type CommunityFeedResponse = {
  feed: CommunityFeedItemV2[];
  filter?: string;
  next_offset?: number | null;
};

/** Mirrors server `CommunityInsights` from `getCommunityInsights`. */
export type CommunityInsightsPayload = {
  summary: string;
  topArtists: { artistId: string; name: string; count: number }[];
  explorationScore: number;
  explorationLabel: string;
  timeOfDay: {
    morning: number;
    afternoon: number;
    night: number;
    lateNight: number;
  };
  dominantTime: string;
  diversityScore: number;
  diversityLabel: string;
};

export type CommunityInsightsResponse = {
  insights: CommunityInsightsPayload;
};

export async function fetchMyCommunities(): Promise<CommunitiesListResponse> {
  return fetcher<CommunitiesListResponse>("/api/communities");
}

export async function createCommunity(body: {
  name: string;
  description: string | null;
  is_private: boolean;
}): Promise<{ community: CommunityRow }> {
  return fetcher<{ community: CommunityRow }>("/api/communities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function joinCommunity(communityId: string): Promise<void> {
  await fetcher("/api/communities/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ communityId }),
  });
}

export async function fetchCommunityDetail(
  communityId: string,
): Promise<CommunityDetailResponse> {
  return fetcher<CommunityDetailResponse>(
    `/api/communities/${encodeURIComponent(communityId)}`,
  );
}

export async function fetchCommunityLeaderboard(
  communityId: string,
): Promise<CommunityLeaderboardResponse> {
  return fetcher<CommunityLeaderboardResponse>(
    `/api/communities/${encodeURIComponent(communityId)}/leaderboard`,
  );
}

export async function fetchCommunityFeed(
  communityId: string,
  limit = 30,
  options?: { filter?: string; offset?: number },
): Promise<CommunityFeedResponse> {
  const q = new URLSearchParams({ limit: String(limit) });
  if (options?.filter) q.set("filter", options.filter);
  if (options?.offset != null) q.set("offset", String(options.offset));
  return fetcher<CommunityFeedResponse>(
    `/api/communities/${encodeURIComponent(communityId)}/feed?${q.toString()}`,
  );
}

export async function fetchCommunityInsights(
  communityId: string,
): Promise<CommunityInsightsResponse> {
  return fetcher<CommunityInsightsResponse>(
    `/api/communities/${encodeURIComponent(communityId)}/insights`,
  );
}

export async function fetchMyCommunityInvites(): Promise<{
  invites: CommunityInvitePending[];
}> {
  return fetcher<{ invites: CommunityInvitePending[] }>(
    "/api/communities/invites",
  );
}

export async function sendCommunityInvite(
  communityId: string,
  invitedUserId: string,
): Promise<{ inviteId: string }> {
  return fetcher<{ inviteId: string }>(
    `/api/communities/${encodeURIComponent(communityId)}/invites`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invitedUserId }),
    },
  );
}

export async function acceptCommunityInviteApi(inviteId: string): Promise<void> {
  await fetcher(`/api/communities/invites/${encodeURIComponent(inviteId)}/accept`, {
    method: "POST",
  });
}

export async function declineCommunityInviteApi(
  inviteId: string,
): Promise<void> {
  await fetcher(`/api/communities/invites/${encodeURIComponent(inviteId)}/decline`, {
    method: "POST",
  });
}

export type SearchUserRow = {
  id: string;
  username: string;
  avatar_url: string | null;
};

export async function searchUsersForInvite(q: string): Promise<SearchUserRow[]> {
  const t = q.trim();
  if (t.length < 2) return [];
  return fetcher<SearchUserRow[]>(
    `/api/search/users?q=${encodeURIComponent(t)}&limit=12`,
  );
}
