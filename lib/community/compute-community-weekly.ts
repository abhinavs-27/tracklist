import "server-only";

import {
  COMMUNITY_FEED_TYPES,
  insertCommunityFeedSingle,
} from "@/lib/community/community-feed-insert";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { cosineSimilarity } from "@/lib/taste/cosineSimilarity";
import {
  buildTasteVectorsFromLogs,
  fetchSongsArtistIds,
  MAX_LOG_ROWS,
  type LogRow,
} from "@/lib/taste/buildTasteVector";
import { getUtcWeekStartDate, rollingWindowIso } from "@/lib/week";
import { longestStreakInWindow } from "@/lib/community/getWeeklyLeaderboard";

const ROLLING_DAYS = 7;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

type MemberRow = { user_id: string };

/**
 * Recompute taste pairs, member stats, weekly summary, and roles for one community.
 * Safe to call from cron; uses service role.
 */
export async function computeCommunityWeekly(communityId: string): Promise<{
  ok: boolean;
  error?: string;
}> {
  const cid = communityId?.trim();
  if (!cid) return { ok: false, error: "invalid id" };

  const admin = createSupabaseAdminClient();
  const { since, until } = rollingWindowIso(ROLLING_DAYS);
  const weekStart = getUtcWeekStartDate(new Date());

  const { data: members, error: memErr } = await admin
    .from("community_members")
    .select("user_id")
    .eq("community_id", cid);

  if (memErr || !members?.length) {
    await admin.from("community_taste_match").delete().eq("community_id", cid);
    return { ok: true };
  }

  const memberIds = [
    ...new Set((members as MemberRow[]).map((m) => m.user_id).filter(Boolean)),
  ];

  const { data: logRows, error: logErr } = await admin
    .from("logs")
    .select("user_id, listened_at, artist_id, track_id")
    .in("user_id", memberIds)
    .gte("listened_at", since)
    .lt("listened_at", until)
    .order("listened_at", { ascending: true })
    .limit(MAX_LOG_ROWS);

  if (logErr) {
    console.error("[community-weekly] logs", logErr);
    return { ok: false, error: logErr.message };
  }

  const logs = (logRows ?? []) as LogRow[];
  const trackIds = [...new Set(logs.map((l) => l.track_id).filter(Boolean))] as string[];
  const songMap = await fetchSongsArtistIds(admin, trackIds);

  const logsByUser = new Map<string, LogRow[]>();
  for (const uid of memberIds) logsByUser.set(uid, []);
  for (const log of logs) {
    const arr = logsByUser.get(log.user_id);
    if (arr) arr.push(log);
  }

  const vectors = new Map<string, Record<string, number>>();
  for (const uid of memberIds) {
    const ulogs = logsByUser.get(uid) ?? [];
    const { normalized } = buildTasteVectorsFromLogs(ulogs, songMap);
    vectors.set(uid, normalized);
  }

  await admin.from("community_taste_match").delete().eq("community_id", cid);

  if (memberIds.length >= 2) {
    const tasteRows: {
      community_id: string;
      user_id: string;
      member_id: string;
      similarity_score: number;
    }[] = [];

    for (let i = 0; i < memberIds.length; i++) {
      for (let j = 0; j < memberIds.length; j++) {
        if (i === j) continue;
        const u = memberIds[i];
        const v = memberIds[j];
        const sim = cosineSimilarity(
          vectors.get(u) ?? {},
          vectors.get(v) ?? {},
        );
        tasteRows.push({
          community_id: cid,
          user_id: u,
          member_id: v,
          similarity_score: sim,
        });
      }
    }

    const CHUNK = 500;
    for (let i = 0; i < tasteRows.length; i += CHUNK) {
      const chunk = tasteRows.slice(i, i + CHUNK);
      const { error: insErr } = await admin
        .from("community_taste_match")
        .insert(chunk);
      if (insErr) {
        console.error("[community-weekly] taste insert", insErr);
        return { ok: false, error: insErr.message };
      }
    }
  }

  const { data: streakRows } = await admin
    .from("user_streaks")
    .select("user_id, current_streak, longest_streak")
    .in("user_id", memberIds);

  const streakMap = new Map(
    (streakRows ?? []).map((r: { user_id: string; current_streak: number; longest_streak: number }) => [
      r.user_id,
      {
        current: Number(r.current_streak) || 0,
        longest: Number(r.longest_streak) || 0,
      },
    ]),
  );

  const byUser = new Map<
    string,
    { totalLogs: number; artists: Set<string>; days: Set<string> }
  >();
  for (const uid of memberIds) {
    byUser.set(uid, { totalLogs: 0, artists: new Set(), days: new Set() });
  }
  for (const log of logs) {
    const b = byUser.get(log.user_id);
    if (!b) continue;
    b.totalLogs += 1;
    b.days.add(dayKey(log.listened_at));
    const aid =
      log.artist_id?.trim() ||
      (log.track_id ? songMap.get(log.track_id) : undefined);
    if (aid) b.artists.add(aid);
  }

  const rangeStart = since.slice(0, 10);
  const rangeEnd = until.slice(0, 10);

  const statsRows: {
    community_id: string;
    user_id: string;
    listen_count_7d: number;
    unique_artists_7d: number;
    current_streak: number;
    longest_streak: number;
    max_streak_in_community: number;
  }[] = [];

  for (const uid of memberIds) {
    const b = byUser.get(uid)!;
    const st = streakMap.get(uid) ?? { current: 0, longest: 0 };
    const streakDays = longestStreakInWindow(b.days, rangeStart, rangeEnd);
    statsRows.push({
      community_id: cid,
      user_id: uid,
      listen_count_7d: b.totalLogs,
      unique_artists_7d: b.artists.size,
      current_streak: st.current,
      longest_streak: st.longest,
      max_streak_in_community: streakDays,
    });
  }

  await admin.from("community_member_stats").delete().eq("community_id", cid);
  if (statsRows.length) {
    const { error: stErr } = await admin
      .from("community_member_stats")
      .insert(statsRows);
    if (stErr) {
      console.error("[community-weekly] member_stats", stErr);
      return { ok: false, error: stErr.message };
    }
  }

  let champion = memberIds[0];
  let onFire = memberIds[0];
  let explorer = memberIds[0];
  let maxListen = -1;
  let maxStreak = -1;
  let maxArtists = -1;

  for (const uid of memberIds) {
    const b = byUser.get(uid)!;
    const st = streakMap.get(uid) ?? { current: 0, longest: 0 };
    if (
      b.totalLogs > maxListen ||
      (b.totalLogs === maxListen && uid < champion)
    ) {
      maxListen = b.totalLogs;
      champion = uid;
    }
    if (st.current > maxStreak || (st.current === maxStreak && uid < onFire)) {
      maxStreak = st.current;
      onFire = uid;
    }
    if (
      b.artists.size > maxArtists ||
      (b.artists.size === maxArtists && uid < explorer)
    ) {
      maxArtists = b.artists.size;
      explorer = uid;
    }
  }

  const rolePayload = [
    { community_id: cid, user_id: champion, role_type: "champion" as const, week_start: weekStart },
    { community_id: cid, user_id: onFire, role_type: "on_fire" as const, week_start: weekStart },
    { community_id: cid, user_id: explorer, role_type: "explorer" as const, week_start: weekStart },
  ];

  const ROLE_FEED_LABEL: Record<string, string> = {
    champion: "Champion",
    on_fire: "On Fire",
    explorer: "Explorer",
  };

  for (const r of rolePayload) {
    const { error: rErr } = await admin.from("community_member_roles").upsert(
      {
        community_id: r.community_id,
        user_id: r.user_id,
        role_type: r.role_type,
        week_start: r.week_start,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "community_id,role_type" },
    );
    if (rErr) {
      console.error("[community-weekly] roles", rErr);
      return { ok: false, error: rErr.message };
    }
    await insertCommunityFeedSingle({
      communityId: r.community_id,
      userId: r.user_id,
      eventType: COMMUNITY_FEED_TYPES.streak_role,
      payload: {
        role_type: r.role_type,
        week_start: r.week_start,
        label: ROLE_FEED_LABEL[r.role_type] ?? r.role_type,
        milestone: "Weekly community role",
      },
    });
  }

  const genreCounts = new Map<string, number>();
  const artistIds = new Set<string>();
  for (const log of logs) {
    const aid =
      log.artist_id?.trim() ||
      (log.track_id ? songMap.get(log.track_id) : undefined);
    if (aid) artistIds.add(aid);
  }

  const artistList = [...artistIds];
  const CH = 300;
  const genreMap = new Map<string, string[]>();
  for (let i = 0; i < artistList.length; i += CH) {
    const slice = artistList.slice(i, i + CH);
    const { data: arts } = await admin
      .from("artists")
      .select("id, genres")
      .in("id", slice);
    for (const row of arts ?? []) {
      const r = row as { id: string; genres: string[] | null };
      genreMap.set(r.id, r.genres ?? []);
    }
  }

  for (const log of logs) {
    const aid =
      log.artist_id?.trim() ||
      (log.track_id ? songMap.get(log.track_id) : undefined);
    if (!aid) continue;
    const genres = genreMap.get(aid) ?? [];
    if (genres.length === 0) continue;
    const w = 1 / genres.length;
    for (const g of genres) {
      const k = g.trim();
      if (!k) continue;
      genreCounts.set(k, (genreCounts.get(k) ?? 0) + w);
    }
  }

  const topGenres = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, weight]) => ({ name, weight: Math.round(weight * 100) / 100 }));

  const styleCounts = new Map<string, number>();
  const { data: cacheRows } = await admin
    .from("taste_identity_cache")
    .select("user_id, payload")
    .in("user_id", memberIds);

  for (const row of cacheRows ?? []) {
    const r = row as { user_id: string; payload: { listeningStyle?: string } | null };
    const style = r.payload?.listeningStyle;
    if (!style || typeof style !== "string") continue;
    styleCounts.set(style, (styleCounts.get(style) ?? 0) + 1);
  }

  const totalStyle = [...styleCounts.values()].reduce((a, b) => a + b, 0);
  const topStyles =
    totalStyle === 0
      ? []
      : [...styleCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([style, n]) => ({
            style,
            share: Math.round((n / totalStyle) * 1000) / 1000,
          }));

  const hourBuckets: Record<string, number> = {
    "0-5": 0,
    "6-11": 0,
    "12-17": 0,
    "18-23": 0,
  };
  for (const log of logs) {
    const h = new Date(log.listened_at).getUTCHours();
    if (h < 6) hourBuckets["0-5"] += 1;
    else if (h < 12) hourBuckets["6-11"] += 1;
    else if (h < 18) hourBuckets["12-17"] += 1;
    else hourBuckets["18-23"] += 1;
  }
  const logN = logs.length || 1;
  const activity_pattern: Record<string, number> = {};
  for (const [k, v] of Object.entries(hourBuckets)) {
    activity_pattern[k] = Math.round((v / logN) * 1000) / 1000;
  }

  const { error: sumErr } = await admin.from("community_weekly_summary").upsert(
    {
      community_id: cid,
      week_start: weekStart,
      top_genres: topGenres,
      top_styles: topStyles,
      activity_pattern,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "community_id,week_start" },
  );
  if (sumErr) {
    console.error("[community-weekly] summary", sumErr);
    return { ok: false, error: sumErr.message };
  }

  return { ok: true };
}

export async function computeAllCommunitiesWeekly(
  maxCommunities = 40,
): Promise<{ processed: number; failures: number }> {
  const admin = createSupabaseAdminClient();
  const { data: rows, error } = await admin
    .from("communities")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(maxCommunities);

  if (error || !rows?.length) return { processed: 0, failures: 0 };

  let processed = 0;
  let failures = 0;
  for (const r of rows as { id: string }[]) {
    const res = await computeCommunityWeekly(r.id);
    if (res.ok) processed += 1;
    else failures += 1;
  }
  return { processed, failures };
}
