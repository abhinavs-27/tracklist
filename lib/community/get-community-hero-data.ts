import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOG_ROWS = 40000;

export type CommunityHeroTopArtist = {
  id: string;
  name: string;
  imageUrl: string | null;
  listens: number;
};

type LogRow = {
  user_id: string;
  listened_at: string;
  artist_id: string | null;
  track_id: string | null;
};

async function fetchSongsArtistIds(
  admin: SupabaseClient,
  trackIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(trackIds)].filter(Boolean);
  const CHUNK = 400;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const { data, error } = await admin
      .from("songs")
      .select("id, artist_id")
      .in("id", chunk);
    if (error) continue;
    for (const row of data ?? []) {
      const r = row as { id: string; artist_id: string };
      out.set(r.id, r.artist_id);
    }
  }
  return out;
}

/**
 * New members in the last 7 days (rolling window).
 */
export async function getCommunityMemberGrowthThisWeek(
  communityId: string,
): Promise<number> {
  const admin = createSupabaseAdminClient();
  const cid = communityId?.trim();
  if (!cid) return 0;

  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();
  const { count, error } = await admin
    .from("community_members")
    .select("*", { count: "exact", head: true })
    .eq("community_id", cid)
    .gte("created_at", since);

  if (error) {
    console.error("[community] member growth count failed", error);
    return 0;
  }
  return count ?? 0;
}

/**
 * Top artists by listen volume among community members (last 7 days).
 * Used for hero "Top this week" and blurred background collage.
 */
export async function getCommunityHeroListeningData(communityId: string): Promise<{
  topArtists: CommunityHeroTopArtist[];
  /** Up to 6 image URLs for the hero background (may be fewer if missing art). */
  backgroundImageUrls: string[];
}> {
  const admin = createSupabaseAdminClient();
  const cid = communityId?.trim();
  if (!cid) return { topArtists: [], backgroundImageUrls: [] };

  const { data: members, error: memErr } = await admin
    .from("community_members")
    .select("user_id")
    .eq("community_id", cid);
  if (memErr || !members?.length) {
    return { topArtists: [], backgroundImageUrls: [] };
  }

  const memberIds = [
    ...new Set(
      (members as { user_id: string }[]).map((m) => m.user_id).filter(Boolean),
    ),
  ];
  if (memberIds.length === 0) return { topArtists: [], backgroundImageUrls: [] };

  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();

  const { data: logRows, error: logErr } = await admin
    .from("logs")
    .select("user_id, listened_at, artist_id, track_id")
    .in("user_id", memberIds)
    .gte("listened_at", since)
    .order("listened_at", { ascending: true })
    .limit(MAX_LOG_ROWS);

  if (logErr) {
    console.error("[community] hero logs failed", logErr);
    return { topArtists: [], backgroundImageUrls: [] };
  }

  const logs = (logRows ?? []) as LogRow[];
  const trackIds = [...new Set(logs.map((l) => l.track_id).filter(Boolean))] as string[];
  const songMap = await fetchSongsArtistIds(admin, trackIds);

  const artistCounts = new Map<string, number>();
  for (const log of logs) {
    const aid =
      log.artist_id?.trim() ||
      (log.track_id ? songMap.get(log.track_id) : undefined);
    if (!aid) continue;
    artistCounts.set(aid, (artistCounts.get(aid) ?? 0) + 1);
  }

  const sortedIds = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  const forDisplay = sortedIds.slice(0, 3);
  const forBg = sortedIds.slice(0, 8);

  if (forDisplay.length === 0) {
    return { topArtists: [], backgroundImageUrls: [] };
  }

  const { data: artistRows, error: artErr } = await admin
    .from("artists")
    .select("id, name, image_url")
    .in("id", forBg);

  if (artErr) {
    console.error("[community] hero artists fetch failed", artErr);
    return { topArtists: [], backgroundImageUrls: [] };
  }

  const byId = new Map(
    (artistRows ?? []).map((r: { id: string; name: string; image_url: string | null }) => [
      r.id,
      { name: r.name, imageUrl: r.image_url },
    ]),
  );

  const topArtists: CommunityHeroTopArtist[] = forDisplay.map((id) => {
    const meta = byId.get(id);
    return {
      id,
      name: meta?.name ?? "Artist",
      imageUrl: meta?.imageUrl ?? null,
      listens: artistCounts.get(id) ?? 0,
    };
  });

  const backgroundImageUrls = forBg
    .map((id) => byId.get(id)?.imageUrl)
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  return { topArtists, backgroundImageUrls };
}
