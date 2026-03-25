import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type ListeningInsightsResult = { insights: string[] };

const LOOKBACK_DAYS = 60;
const MAX_ROWS = 1000;
const MIN_LOGS = 20;

/** Binge: single calendar day with more than this many logs. */
const BINGE_DAY_THRESHOLD = 40;

type LogRow = {
  created_at: string | null;
  listened_at: string;
  artist_id: string | null;
  album_id: string | null;
  track_id: string | null;
};

type TimeBucket = "late" | "morning" | "afternoon" | "evening";

function hourToBucket(h: number): TimeBucket {
  // 5am–12pm → morning, 12–5pm → afternoon, 5–10pm → evening, 10pm–5am → late night
  if (h >= 22 || h <= 4) return "late";
  if (h >= 5 && h <= 11) return "morning";
  if (h >= 12 && h <= 16) return "afternoon";
  return "evening";
}

function bucketLabel(bucket: TimeBucket): string {
  switch (bucket) {
    case "late":
      return "You mostly listen to music late at night.";
    case "morning":
      return "Your listening peaks in the morning.";
    case "afternoon":
      return "Your listening peaks in the afternoon.";
    case "evening":
      return "Your listening peaks in the evening.";
    default:
      return "";
  }
}

type Scored = { text: string; score: number; kind: string };

function dedupeByKind(items: Scored[]): Scored[] {
  const seen = new Set<string>();
  const out: Scored[] = [];
  for (const x of items.sort((a, b) => b.score - a.score)) {
    if (seen.has(x.kind)) continue;
    seen.add(x.kind);
    out.push(x);
  }
  return out;
}

function dedupeText(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const k = line.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(line);
  }
  return out;
}

/**
 * Time-based, behavioral listening analysis (no joins).
 * Window: last 60 days, capped at 1000 rows. Uses `listened_at` for when a play
 * happened (behavioral time); `created_at` is selected for auditing only.
 */
export async function getListeningInsights(
  userId: string,
): Promise<ListeningInsightsResult> {
  const empty = (): ListeningInsightsResult => ({
    insights: ["Not enough listening data yet"],
  });

  const uid = userId?.trim();
  if (!uid) return empty();

  const admin = createSupabaseAdminClient();
  const since = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { data, error } = await admin
    .from("logs")
    .select("created_at, listened_at, artist_id, album_id, track_id")
    .eq("user_id", uid)
    .gte("listened_at", since)
    .order("listened_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    console.error("[listening-insights] logs query failed", error);
    return empty();
  }

  const rows = (data ?? []) as LogRow[];
  if (rows.length < MIN_LOGS) {
    return empty();
  }

  const total = rows.length;
  const bucketCounts: Record<TimeBucket, number> = {
    late: 0,
    morning: 0,
    afternoon: 0,
    evening: 0,
  };

  const dayCounts = new Map<string, number>();
  const daySet = new Set<string>();
  const artistKeys = new Set<string>();
  let withAlbum = 0;

  for (const row of rows) {
    const t = new Date(row.listened_at);
    if (Number.isNaN(t.getTime())) continue;

    const h = t.getUTCHours();
    bucketCounts[hourToBucket(h)] += 1;

    const dayKey = t.toISOString().slice(0, 10);
    dayCounts.set(dayKey, (dayCounts.get(dayKey) ?? 0) + 1);
    daySet.add(dayKey);

    const aid = row.artist_id?.trim();
    const tid = row.track_id?.trim();
    const key = aid && aid.length > 0 ? aid : tid ? `t:${tid}` : "";
    if (key) artistKeys.add(key);

    if (row.album_id != null && String(row.album_id).trim() !== "") {
      withAlbum += 1;
    }
  }

  const uniqueArtists = artistKeys.size;
  const uniqueRatio = uniqueArtists / Math.max(total, 1);
  const albumRatio = withAlbum / total;

  let maxDayLogs = 0;
  for (const c of dayCounts.values()) maxDayLogs = Math.max(maxDayLogs, c);

  const sortedDays = [...daySet].sort();
  const spanDays =
    sortedDays.length >= 1
      ? Math.max(
          1,
          Math.round(
            (new Date(sortedDays[sortedDays.length - 1]!).getTime() -
              new Date(sortedDays[0]!).getTime()) /
              (24 * 60 * 60 * 1000),
          ) + 1,
        )
      : 1;
  const activeDays = daySet.size;
  const dayDensity = activeDays / Math.max(spanDays, 1);

  const candidates: Scored[] = [];

  // 1) Time of day — strongest bucket must clear others modestly
  let peakBucket: TimeBucket = "evening";
  let peakCount = 0;
  (Object.keys(bucketCounts) as TimeBucket[]).forEach((b) => {
    if (bucketCounts[b] > peakCount) {
      peakCount = bucketCounts[b];
      peakBucket = b;
    }
  });
  const peakShare = peakCount / total;
  const secondCount = [...(Object.keys(bucketCounts) as TimeBucket[])]
    .filter((b) => b !== peakBucket)
    .reduce((m, b) => Math.max(m, bucketCounts[b]), 0);
  if (
    peakShare >= 0.2 &&
    peakCount >= secondCount * 1.12 &&
    peakShare >= 0.17
  ) {
    const text = bucketLabel(peakBucket);
    if (text) {
      candidates.push({
        kind: "time",
        text,
        score: 55 + peakShare * 45 + (peakCount - secondCount) * 0.02,
      });
    }
  }

  // 2) Binge
  if (maxDayLogs > BINGE_DAY_THRESHOLD) {
    candidates.push({
      kind: "binge",
      text: "You have intense music binges.",
      score: 92,
    });
  }

  // 3) Repeat vs discovery (mutually exclusive)
  if (uniqueRatio < 0.3 && uniqueArtists >= 3) {
    candidates.push({
      kind: "repeat",
      text: "You tend to stick with your favorite artists.",
      score: 78 + (0.3 - uniqueRatio) * 40,
    });
  } else if (uniqueRatio > 0.7) {
    candidates.push({
      kind: "discovery",
      text: "You're constantly discovering new artists.",
      score: 78 + (uniqueRatio - 0.7) * 60,
    });
  }

  // 4) Album behavior
  if (albumRatio >= 0.45) {
    candidates.push({
      kind: "album",
      text: "You prefer listening to full albums.",
      score: 62 + albumRatio * 25,
    });
  } else if (albumRatio <= 0.38) {
    candidates.push({
      kind: "album",
      text: "You mostly listen to individual tracks.",
      score: 60 + (0.38 - albumRatio) * 30,
    });
  }

  // 5) Consistency (needs enough calendar spread)
  if (spanDays >= 12) {
    if (dayDensity >= 0.58 && activeDays >= 14) {
      candidates.push({
        kind: "consistency",
        text: "You listen to music almost every day.",
        score: 70 + dayDensity * 20,
      });
    } else if (dayDensity <= 0.34 && activeDays >= 4) {
      candidates.push({
        kind: "consistency",
        text: "Your listening comes in bursts.",
        score: 68 + (0.34 - dayDensity) * 25,
      });
    }
  }

  const picked = dedupeByKind(candidates);
  const texts = dedupeText(picked.map((p) => p.text)).slice(0, 5);

  if (texts.length === 0) {
    return {
      insights: [
        "Your recent listening is eclectic — keep logging to surface sharper patterns.",
      ],
    };
  }

  return { insights: texts };
}
