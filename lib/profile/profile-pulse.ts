import "server-only";

import { getListeningReportsCompare } from "@/lib/analytics/getReportsCompare";
import {
  currentWeekStart,
  previousWeekStart,
} from "@/lib/analytics/period-now";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type ProfilePulseInsights = {
  /** Short lines for the pulse card (max 4). */
  bullets: string[];
};

async function topArtistIdsForWeek(
  userId: string,
  weekStart: string,
  limit: number,
): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_listening_aggregates")
    .select("entity_id")
    .eq("user_id", userId)
    .eq("entity_type", "artist")
    .eq("week_start", weekStart)
    .is("month", null)
    .is("year", null)
    .order("count", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[profile-pulse] topArtistIdsForWeek", error.message);
    return [];
  }
  return (data ?? []).map((r) => r.entity_id as string);
}

async function resolveArtistNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("artists").select("id, name").in("id", ids);
  const m = new Map<string, string>();
  for (const row of data ?? []) {
    m.set(row.id as string, (row.name as string) ?? row.id);
  }
  return m;
}

function fmtPct(n: number): string {
  const r = Math.round(n);
  return r > 0 ? `+${r}%` : `${r}%`;
}

/**
 * Time-based, comparative copy for the profile “Pulse” strip (week vs prior week).
 * (Taste “insight week” line stays on the hero — this block is deltas vs last week.)
 */
export async function getProfilePulseInsights(
  userId: string,
): Promise<ProfilePulseInsights | null> {
  const uid = userId?.trim();
  if (!uid) return null;

  const week = currentWeekStart();
  const prevWeek = previousWeekStart(week);

  const [artistCmp, genreCmp, curIds, prevIds] = await Promise.all([
    getListeningReportsCompare({
      userId: uid,
      range: "week",
      entityType: "artist",
    }),
    getListeningReportsCompare({
      userId: uid,
      range: "week",
      entityType: "genre",
    }),
    topArtistIdsForWeek(uid, week, 24),
    topArtistIdsForWeek(uid, prevWeek, 40),
  ]);

  const prevSet = new Set(prevIds);
  const freshIds = curIds.filter((id) => !prevSet.has(id)).slice(0, 4);
  const nameMap =
    freshIds.length > 0 ? await resolveArtistNames(freshIds) : new Map();
  const newNames = freshIds
    .map((id) => nameMap.get(id))
    .filter((n): n is string => Boolean(n?.trim()));

  const bullets: string[] = [];

  const { percentChange, totalPlaysCurrent, totalPlaysPrevious } = artistCmp;
  if (
    percentChange != null &&
    totalPlaysPrevious > 0 &&
    Math.abs(percentChange) >= 4
  ) {
    const dir = percentChange > 0 ? "up" : "down";
    bullets.push(
      `This week’s play volume is ${dir} about ${fmtPct(
        Math.abs(percentChange),
      )} vs last week (${totalPlaysCurrent.toLocaleString()} vs ${totalPlaysPrevious.toLocaleString()} plays).`,
    );
  }

  if (artistCmp.topGainer) {
    bullets.push(
      `Biggest move on your artist chart: ${artistCmp.topGainer.name} (vs last week).`,
    );
  }

  if (genreCmp.topGainer) {
    const g = genreCmp.topGainer.name;
    const cap = g.charAt(0).toUpperCase() + g.slice(1);
    bullets.push(`Genre momentum: ${cap} gained the most ground vs last week.`);
  }

  if (newNames.length > 0) {
    const joined =
      newNames.length <= 2
        ? newNames.join(" · ")
        : `${newNames.slice(0, 2).join(" · ")} +${newNames.length - 2} more`;
    bullets.push(`New in your weekly rotation: ${joined}.`);
  }

  const uniq = [...new Set(bullets)];
  if (uniq.length === 0) return null;
  return { bullets: uniq.slice(0, 4) };
}
