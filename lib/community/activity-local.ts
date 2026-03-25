import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { MAX_LOG_ROWS } from "@/lib/taste/buildTasteVector";
import { rollingWindowIso } from "@/lib/week";

export type LocalActivityBucket = {
  id: "night" | "morning" | "afternoon" | "evening";
  label: string;
  /** Short hint, e.g. "12–6am" (local) */
  rangeHint: string;
  /** 0–1 share of listens in this bucket */
  share: number;
};

const BUCKET_DEF: {
  id: LocalActivityBucket["id"];
  label: string;
  rangeHint: string;
  match: (h: number) => boolean;
}[] = [
  {
    id: "night",
    label: "Night",
    rangeHint: "12–6am",
    match: (h) => h >= 0 && h < 6,
  },
  {
    id: "morning",
    label: "Morning",
    rangeHint: "6am–12pm",
    match: (h) => h >= 6 && h < 12,
  },
  {
    id: "afternoon",
    label: "Afternoon",
    rangeHint: "12–6pm",
    match: (h) => h >= 12 && h < 18,
  },
  {
    id: "evening",
    label: "Evening",
    rangeHint: "6pm–12am",
    match: (h) => h >= 18 && h <= 23,
  },
];

/** IANA timezone string (e.g. America/Los_Angeles). */
export function isValidTimeZone(tz: string): boolean {
  const t = tz?.trim();
  if (!t) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: t });
    return true;
  } catch {
    return false;
  }
}

function localHour(iso: string, timeZone: string): number {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value;
  if (h == null) return d.getUTCHours();
  const n = parseInt(h, 10);
  return Number.isFinite(n) ? n % 24 : d.getUTCHours();
}

/**
 * When members listened (this week), grouped into four local-time-of-day buckets.
 */
export function computeLocalActivityBuckets(
  logs: { listened_at: string }[],
  timeZone: string,
): LocalActivityBucket[] {
  const counts = [0, 0, 0, 0];
  for (const log of logs) {
    const h = localHour(log.listened_at, timeZone);
    const idx = BUCKET_DEF.findIndex((b) => b.match(h));
    if (idx >= 0) counts[idx] += 1;
  }
  const total = counts.reduce((a, b) => a + b, 0) || 1;
  return BUCKET_DEF.map((b, i) => ({
    id: b.id,
    label: b.label,
    rangeHint: b.rangeHint,
    share: Math.round((counts[i] / total) * 1000) / 1000,
  }));
}

/** Same rolling window as `compute-community-weekly` (last 7 days). */
export async function fetchCommunityLogsRolling(
  admin: SupabaseClient,
  communityId: string,
): Promise<{ listened_at: string }[]> {
  const cid = communityId?.trim();
  if (!cid) return [];

  const { data: members, error: mErr } = await admin
    .from("community_members")
    .select("user_id")
    .eq("community_id", cid);
  if (mErr || !members?.length) return [];

  const memberIds = [
    ...new Set(
      (members as { user_id: string }[]).map((m) => m.user_id).filter(Boolean),
    ),
  ];
  if (memberIds.length === 0) return [];

  const { since, until } = rollingWindowIso(7);

  const { data: logRows, error: logErr } = await admin
    .from("logs")
    .select("listened_at")
    .in("user_id", memberIds)
    .gte("listened_at", since)
    .lt("listened_at", until)
    .order("listened_at", { ascending: true })
    .limit(MAX_LOG_ROWS);

  if (logErr) {
    console.error("[activity-local] logs", logErr);
    return [];
  }

  return (logRows ?? []) as { listened_at: string }[];
}

/** Buckets member listens from the last 7 days into local time-of-day (matches weekly job window). */
export async function getLocalActivityRollingSevenDays(
  communityId: string,
  timeZone: string,
): Promise<LocalActivityBucket[]> {
  const admin = createSupabaseAdminClient();
  const logs = await fetchCommunityLogsRolling(admin, communityId);
  return computeLocalActivityBuckets(logs, timeZone);
}
