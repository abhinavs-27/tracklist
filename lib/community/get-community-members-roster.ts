import "server-only";

import type { CommunityMemberRosterEntry } from "@/lib/community/community-member-roster-types";
import { COMMUNITY_MEMBERS_PAGE_SIZE } from "@/lib/community/community-members-page-size";
import { enrichRosterWithTasteScores } from "@/lib/community/enrich-roster-with-taste-neighbors";
import type { CommunityMemberRole } from "@/lib/community/member-role";
import { getCommunityMemberStatsWithRoles } from "@/lib/community/get-community-member-stats";
import { getCommunityTasteSimilarityScoresForViewer } from "@/lib/community/get-community-taste-matches";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fetchUserMap } from "@/lib/queries";

function tasteFromPayload(payload: unknown): { genres: string[]; artists: string[] } {
  const p = payload as {
    topGenres?: { name?: string }[];
    topArtists?: { name?: string }[];
  };
  const genres = (p.topGenres ?? [])
    .map((g) => g.name?.trim())
    .filter((x): x is string => Boolean(x))
    .slice(0, 3);
  const artists = (p.topArtists ?? [])
    .map((a) => a.name?.trim())
    .filter((x): x is string => Boolean(x))
    .slice(0, 3);
  return { genres, artists };
}

function normalizeMemberRole(raw: string | null | undefined): CommunityMemberRole | null {
  if (raw === "admin" || raw === "owner") return "admin";
  if (raw === "member") return "member";
  return null;
}

function buildTasteSummary(genres: string[], artists: string[]): string | null {
  const g = genres.slice(0, 2);
  const a = artists.slice(0, 2);
  if (g.length && a.length) return `${g.join(", ")} · ${a.join(", ")}`;
  if (g.length) return g.join(", ");
  if (a.length) return a.join(", ");
  return null;
}

async function buildFullCommunityMembersRoster(
  communityId: string,
  viewerId: string | null,
  communityCreatedBy: string,
): Promise<CommunityMemberRosterEntry[]> {
  const admin = createSupabaseAdminClient();
  const cid = communityId.trim();
  if (!cid) return [];

  const { data: rows, error } = await admin
    .from("community_members")
    .select("user_id, role, created_at")
    .eq("community_id", cid)
    .order("created_at", { ascending: true });

  if (error || !rows?.length) return [];

  const userIds = (rows as { user_id: string }[]).map((r) => r.user_id);
  const userMap = await fetchUserMap(admin, userIds);

  const [stats, cacheResult, followResult, similarityScores] = await Promise.all([
    getCommunityMemberStatsWithRoles(cid),
    admin.from("taste_identity_cache").select("user_id, payload").in("user_id", userIds),
    viewerId
      ? admin
          .from("follows")
          .select("following_id")
          .eq("follower_id", viewerId.trim())
          .in("following_id", userIds)
      : Promise.resolve({ data: [] as { following_id: string }[] }),
    viewerId
      ? getCommunityTasteSimilarityScoresForViewer(cid, viewerId)
      : Promise.resolve(new Map<string, number>()),
  ]);

  const statsByUser = new Map(stats.map((s) => [s.userId, s]));
  const tasteByUser = new Map<string, { genres: string[]; artists: string[] }>();
  for (const row of cacheResult.data ?? []) {
    const r = row as { user_id: string; payload: unknown };
    tasteByUser.set(r.user_id, tasteFromPayload(r.payload));
  }

  const followingSet = new Set(
    (followResult.data ?? []).map((f) => f.following_id),
  );

  const out: CommunityMemberRosterEntry[] = (rows as {
    user_id: string;
    role: string;
    created_at: string;
  }[]).map((r) => {
    const u = userMap.get(r.user_id);
    const role = normalizeMemberRole(r.role) ?? "member";
    const st = statsByUser.get(r.user_id);
    let activity_line: string | null = null;
    if (st) {
      if (st.listen_count_7d > 0 || st.unique_artists_7d > 0) {
        activity_line = `${st.listen_count_7d} listens · ${st.unique_artists_7d} artists this week`;
      }
    }
    const t = tasteByUser.get(r.user_id) ?? { genres: [], artists: [] };
    const taste_summary = buildTasteSummary(t.genres, t.artists);

    return {
      user_id: r.user_id,
      username: u?.username ?? "Unknown",
      avatar_url: u?.avatar_url ?? null,
      role,
      joined_at: r.created_at,
      taste_summary,
      top_genres: t.genres,
      top_artists: t.artists,
      activity_line,
      viewer_follows: followingSet.has(r.user_id),
      is_community_creator: r.user_id === communityCreatedBy,
    };
  });

  out.sort((a, b) => {
    const sa = similarityScores.get(a.user_id);
    const sb = similarityScores.get(b.user_id);
    const hasA = sa !== undefined;
    const hasB = sb !== undefined;
    if (hasA && !hasB) return -1;
    if (!hasA && hasB) return 1;
    if (hasA && hasB && sb !== sa) return (sb as number) - (sa as number);
    return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
  });

  return enrichRosterWithTasteScores(out, similarityScores);
}

export type CommunityMembersRosterPage = {
  roster: CommunityMemberRosterEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/**
 * Members of a community with taste hints, weekly activity, and follow state for the viewer.
 * Sorted by taste similarity to the viewer when weekly `community_taste_match` rows exist
 * (highest first); members without scores last, then by name. Paginated in memory.
 */
export async function getCommunityMembersRoster(
  communityId: string,
  viewerId: string | null,
  communityCreatedBy: string,
  options?: { page?: number; pageSize?: number },
): Promise<CommunityMembersRosterPage> {
  const pageSize = options?.pageSize ?? COMMUNITY_MEMBERS_PAGE_SIZE;
  const requestedPage = Math.max(1, Math.floor(options?.page ?? 1));

  const full = await buildFullCommunityMembersRoster(
    communityId,
    viewerId,
    communityCreatedBy,
  );
  const total = full.length;
  const totalPages = total === 0 ? 1 : Math.ceil(total / pageSize);
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * pageSize;
  const roster = full.slice(start, start + pageSize);

  return { roster, total, page, pageSize, totalPages };
}
