import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getUtcWeekStartDate } from "@/lib/week";

export type WeeklySummaryPayload = {
  week_start: string;
  top_genres: { name: string; weight: number }[];
  top_styles: { style: string; share: number }[];
  activity_pattern: Record<string, number>;
  updated_at: string | null;
};

function diffTopGenres(
  prev: { name: string; weight: number }[],
  cur: { name: string; weight: number }[],
): { gained: string[]; lost: string[] } {
  const prevSet = new Set(prev.map((g) => g.name));
  const curSet = new Set(cur.map((g) => g.name));
  const gained = [...curSet].filter((x) => !prevSet.has(x)).slice(0, 5);
  const lost = [...prevSet].filter((x) => !curSet.has(x)).slice(0, 5);
  return { gained, lost };
}

/**
 * Current and previous ISO week summaries + simple genre delta.
 */
export async function getCommunityWeeklySummaryWithTrend(
  communityId: string,
): Promise<{
  current: WeeklySummaryPayload | null;
  previous: WeeklySummaryPayload | null;
  trend: { genres: { gained: string[]; lost: string[] } } | null;
}> {
  const admin = createSupabaseAdminClient();
  const cid = communityId?.trim();
  if (!cid) {
    return { current: null, previous: null, trend: null };
  }

  const thisWeek = getUtcWeekStartDate(new Date());
  const prevDate = new Date(thisWeek + "T00:00:00.000Z");
  prevDate.setUTCDate(prevDate.getUTCDate() - 7);
  const prevWeek = prevDate.toISOString().slice(0, 10);

  const { data: rows } = await admin
    .from("community_weekly_summary")
    .select("week_start, top_genres, top_styles, activity_pattern, updated_at")
    .eq("community_id", cid)
    .in("week_start", [thisWeek, prevWeek]);

  const byWeek = new Map(
    (rows ?? []).map((r) => {
      const row = r as {
        week_start: string;
        top_genres: unknown;
        top_styles: unknown;
        activity_pattern: unknown;
        updated_at: string | null;
      };
      return [
        row.week_start,
        {
          week_start: row.week_start,
          top_genres: (row.top_genres as WeeklySummaryPayload["top_genres"]) ?? [],
          top_styles: (row.top_styles as WeeklySummaryPayload["top_styles"]) ?? [],
          activity_pattern:
            (row.activity_pattern as WeeklySummaryPayload["activity_pattern"]) ??
            {},
          updated_at: row.updated_at,
        } satisfies WeeklySummaryPayload,
      ];
    }),
  );

  const current = byWeek.get(thisWeek) ?? null;
  const previous = byWeek.get(prevWeek) ?? null;

  let trend: { genres: { gained: string[]; lost: string[] } } | null = null;
  if (current && previous) {
    trend = {
      genres: diffTopGenres(previous.top_genres, current.top_genres),
    };
  }

  return { current, previous, trend };
}
