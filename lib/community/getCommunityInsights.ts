import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LOG_ROWS = 40000;

export type CommunityInsights = {
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
  /** Human label for the busiest bucket, e.g. "late night". */
  dominantTime: string;
  diversityScore: number;
  diversityLabel: string;
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

function resolveArtistId(
  log: LogRow,
  songMap: Map<string, string>,
): string | null {
  const aid =
    log.artist_id?.trim() ||
    (log.track_id ? songMap.get(log.track_id) : undefined);
  return aid?.trim() || null;
}

function explorationLabel(score: number): string {
  if (score <= 0.3) return "Comfort Rotation";
  if (score <= 0.6) return "Balanced";
  return "Discovery Heavy";
}

/** UTC hour 0–23 from ISO timestamp. */
function utcHour(iso: string): number {
  return new Date(iso).getUTCHours();
}

function bucketForHour(h: number): keyof CommunityInsights["timeOfDay"] {
  if (h >= 6 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  if (h >= 18 && h < 24) return "night";
  return "lateNight";
}

const BUCKET_LABEL: Record<keyof CommunityInsights["timeOfDay"], string> = {
  morning: "morning",
  afternoon: "afternoon",
  night: "evening",
  lateNight: "late night",
};

function dominantBucketKey(
  buckets: CommunityInsights["timeOfDay"],
): keyof CommunityInsights["timeOfDay"] {
  let best: keyof CommunityInsights["timeOfDay"] = "morning";
  let max = -1;
  (Object.keys(buckets) as (keyof CommunityInsights["timeOfDay"])[]).forEach(
    (k) => {
      if (buckets[k] > max) {
        max = buckets[k];
        best = k;
      }
    },
  );
  return best;
}

function diversityLabel(score: number): string {
  if (score >= 0.55) return "Very similar taste";
  if (score >= 0.28) return "Mixed taste";
  return "Highly diverse";
}

/** Jaccard similarity for two sets (0–1). */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function averagePairwiseDiversity(
  memberIds: string[],
  userTopArtists: Map<string, Set<string>>,
): number {
  if (memberIds.length < 2) return 0.5;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < memberIds.length; i++) {
    for (let j = i + 1; j < memberIds.length; j++) {
      const a = userTopArtists.get(memberIds[i]) ?? new Set();
      const b = userTopArtists.get(memberIds[j]) ?? new Set();
      sum += jaccard(a, b);
      n += 1;
    }
  }
  return n === 0 ? 0.5 : sum / n;
}

function buildSummary(input: {
  totalLogs: number;
  explorationScore: number;
  diversityScore: number;
  dominantKey: keyof CommunityInsights["timeOfDay"];
  memberCount: number;
}): string {
  if (input.totalLogs === 0) {
    return "Not enough listening data from the last week yet.";
  }

  let core: string;
  if (input.explorationScore >= 0.6) {
    core = "This community explores a lot of new music";
  } else if (input.explorationScore <= 0.3) {
    core = "Listening stays close to a core set of artists";
  } else {
    core = "This community balances new picks with familiar artists";
  }

  const tasteClause =
    input.memberCount >= 2 && input.diversityScore >= 0.55
      ? "with members who share very similar taste"
      : input.memberCount >= 2 && input.diversityScore <= 0.28
        ? "with highly varied individual tastes"
        : null;

  const timeClause =
    input.dominantKey === "lateNight"
      ? "most active late at night"
      : input.dominantKey === "morning"
        ? "most active in the morning"
        : input.dominantKey === "afternoon"
          ? "most active in the afternoon"
          : input.dominantKey === "night"
            ? "most active in the evening"
            : null;

  if (tasteClause && timeClause) {
    return `${core}, ${tasteClause}, and ${timeClause}.`;
  }
  if (timeClause) {
    return `${core}, and is ${timeClause}.`;
  }
  if (tasteClause) {
    return `${core}, ${tasteClause}.`;
  }
  return `${core}.`;
}

/**
 * Listening insights for a community: last 7 days, all members.
 * Times use UTC hours on `listened_at` (same field as elsewhere in community stats).
 */
export async function getCommunityInsights(
  communityId: string,
): Promise<CommunityInsights> {
  const empty: CommunityInsights = {
    summary: "Not enough listening data from the last week yet.",
    topArtists: [],
    explorationScore: 0,
    explorationLabel: "Balanced",
    timeOfDay: { morning: 0, afternoon: 0, night: 0, lateNight: 0 },
    dominantTime: "morning",
    diversityScore: 0.5,
    diversityLabel: "Mixed taste",
  };

  const admin = createSupabaseAdminClient();
  const cid = communityId?.trim();
  if (!cid) return empty;

  const { data: members, error: memErr } = await admin
    .from("community_members")
    .select("user_id")
    .eq("community_id", cid);
  if (memErr || !members?.length) return empty;

  const memberIds = [
    ...new Set(
      (members as { user_id: string }[]).map((m) => m.user_id).filter(Boolean),
    ),
  ];
  if (memberIds.length === 0) return empty;

  const since = new Date(Date.now() - LOOKBACK_MS).toISOString();

  const { data: logRows, error: logErr } = await admin
    .from("logs")
    .select("user_id, listened_at, artist_id, track_id")
    .in("user_id", memberIds)
    .gte("listened_at", since)
    .order("listened_at", { ascending: true })
    .limit(MAX_LOG_ROWS);

  if (logErr) {
    console.error("[community] insights logs failed", logErr);
    return empty;
  }

  const logs = (logRows ?? []) as LogRow[];
  const trackIds = [...new Set(logs.map((l) => l.track_id).filter(Boolean))] as string[];
  const songMap = await fetchSongsArtistIds(admin, trackIds);

  const artistCounts = new Map<string, number>();
  const timeOfDay: CommunityInsights["timeOfDay"] = {
    morning: 0,
    afternoon: 0,
    night: 0,
    lateNight: 0,
  };

  /** Per-user artist counts for top-5 and diversity */
  const perUserArtistCounts = new Map<string, Map<string, number>>();

  for (const uid of memberIds) {
    perUserArtistCounts.set(uid, new Map());
  }

  let totalLogs = 0;
  const globalArtists = new Set<string>();

  for (const log of logs) {
    totalLogs += 1;
    const hour = utcHour(log.listened_at);
    const bk = bucketForHour(hour);
    timeOfDay[bk] += 1;

    const aid = resolveArtistId(log, songMap);
    if (aid) {
      globalArtists.add(aid);
      artistCounts.set(aid, (artistCounts.get(aid) ?? 0) + 1);

      const uc = perUserArtistCounts.get(log.user_id);
      if (uc) {
        uc.set(aid, (uc.get(aid) ?? 0) + 1);
      }
    }
  }

  const uniqueArtists = globalArtists.size;
  const explorationScore =
    totalLogs > 0 ? uniqueArtists / totalLogs : 0;
  const explorationLbl = explorationLabel(explorationScore);

  const dominantKey = dominantBucketKey(timeOfDay);
  const dominantTime = BUCKET_LABEL[dominantKey];

  const userTopArtists = new Map<string, Set<string>>();
  for (const uid of memberIds) {
    const uc = perUserArtistCounts.get(uid);
    if (!uc || uc.size === 0) {
      userTopArtists.set(uid, new Set());
      continue;
    }
    const sorted = [...uc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    userTopArtists.set(uid, new Set(sorted.map(([id]) => id)));
  }

  const diversityScore = averagePairwiseDiversity(memberIds, userTopArtists);
  const divLabel = diversityLabel(diversityScore);

  const topSorted = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const topIds = topSorted.map(([id]) => id);

  const nameMap = new Map<string, string>();
  if (topIds.length > 0) {
    const { data: artistRows } = await admin
      .from("artists")
      .select("id, name")
      .in("id", topIds);
    for (const row of artistRows ?? []) {
      const r = row as { id: string; name: string };
      nameMap.set(r.id, r.name);
    }
  }

  const topArtists = topSorted.map(([artistId, count]) => ({
    artistId,
    name: nameMap.get(artistId) ?? "Unknown artist",
    count,
  }));

  const summary = buildSummary({
    totalLogs,
    explorationScore,
    diversityScore,
    dominantKey,
    memberCount: memberIds.length,
  });

  return {
    summary,
    topArtists,
    explorationScore,
    explorationLabel: explorationLbl,
    timeOfDay,
    dominantTime,
    diversityScore,
    diversityLabel: divLabel,
  };
}
