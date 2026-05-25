import "server-only";

import {
  getFirstListenAtForArtists,
  getListeningReportsRollingCompare,
  getTopArtistIdsForLogWindow,
} from "@/lib/analytics/getRollingReportsCompare";
import { getRolling7dVsPrior7dBounds } from "@/lib/analytics/rolling-windows";
import { currentWeekStart, previousWeekStart, getWeeklyAgg } from "@/lib/analytics/from-aggregates";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { ListeningReportsCompareResult } from "@/lib/analytics/getReportsCompare";

export type PulseTrend = "up" | "down" | "flat";

export type PulsePlayVolume = {
  trend: PulseTrend;
  percentChange: number;
  currentPlays: number;
  previousPlays: number;
};

export type PulseMover = {
  name: string;
  trend: PulseTrend;
  caption: string;
};

export type PulseDiscoveries = {
  names: string[];
};

export type PulseSoundShift = {
  trend: PulseTrend;
  headline: string;
  detail: string;
};

export type ProfilePulseInsights = {
  /** Rolling window label, e.g. “Last 7 days · vs prior 7 days (UTC)” */
  rangeCaption: string;
  playVolume: PulsePlayVolume | null;
  genreChange: PulseMover | null;
  artistChange: PulseMover | null;
  discoveries: PulseDiscoveries | null;
  soundShift: PulseSoundShift | null;
};

async function resolveArtistNames(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data } = await admin.from("artists").select("id, name").in("id", ids);
  const m = new Map<string, string>();
  for (const row of data ?? []) {
    m.set(row.id as string, (row.name as string) ?? row.id);
  }
  return m;
}

async function fetchPopularityMap(
  trackIds: string[],
): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  if (trackIds.length === 0) return m;
  const admin = createSupabaseAdminClient();
  const chunk = 400;
  for (let i = 0; i < trackIds.length; i += chunk) {
    const slice = trackIds.slice(i, i + chunk);
    const { data, error } = await admin
      .from("tracks")
      .select("id, popularity")
      .in("id", slice);
    if (error) {
      console.warn("[profile-pulse] songs popularity batch", error.message);
      continue;
    }
    for (const row of data ?? []) {
      const id = row.id as string;
      const p = row.popularity;
      if (typeof p === "number" && Number.isFinite(p)) m.set(id, p);
    }
  }
  return m;
}

type WindowStats = {
  playCount: number;
  avgPopularity: number | null;
  popSamples: number;
  uniqueArtists: number;
};

async function listeningWindowStats(
  userId: string,
  weekStart: string,  // "YYYY-MM-DD" Monday UTC
): Promise<WindowStats> {
  const admin = createSupabaseAdminClient();
  const ZERO: WindowStats = { playCount: 0, avgPopularity: null, popSamples: 0, uniqueArtists: 0 };

  const [trackRows, artistRows] = await Promise.all([
    getWeeklyAgg(admin, userId, "track",  weekStart, 50),
    getWeeklyAgg(admin, userId, "artist", weekStart, 500),
  ]);

  if (trackRows.length === 0 && artistRows.length === 0) return ZERO;

  const playCount     = trackRows.reduce((s, r) => s + r.count, 0);
  const uniqueArtists = artistRows.length;

  // Popularity: batch-lookup top 50 tracks by play count (already sorted desc by getWeeklyAgg)
  const topTrackIds = trackRows.slice(0, 50).map((r) => r.entity_id);
  const popMap      = await fetchPopularityMap(topTrackIds);

  let sum  = 0;
  let nPop = 0;
  for (const row of trackRows.slice(0, 50)) {
    const p = popMap.get(row.entity_id);
    if (p != null) { sum += p * row.count; nPop += row.count; }
  }

  return {
    playCount,
    avgPopularity: nPop > 0 ? sum / nPop : null,
    popSamples:    nPop,
    uniqueArtists,
  };
}

function fmtGenreLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function pickChartMover(
  cmp: ListeningReportsCompareResult,
  entityLabel: "Genre" | "Artist",
): PulseMover | null {
  if (cmp.topGainer) {
    const name =
      entityLabel === "Genre"
        ? fmtGenreLabel(cmp.topGainer.name)
        : cmp.topGainer.name;
    return {
      name,
      trend: "up",
      caption: `${entityLabel} that climbed the most in your chart this week`,
    };
  }
  if (cmp.topDropper) {
    const name =
      entityLabel === "Genre"
        ? fmtGenreLabel(cmp.topDropper.name)
        : cmp.topDropper.name;
    return {
      name,
      trend: "down",
      caption: `${entityLabel} that dropped the most in your chart this week`,
    };
  }
  return null;
}

function volumeFromCompare(
  cmp: ListeningReportsCompareResult,
): PulsePlayVolume | null {
  const { percentChange, totalPlaysCurrent, totalPlaysPrevious } = cmp;
  if (
    percentChange == null ||
    totalPlaysPrevious <= 0 ||
    Math.abs(percentChange) < 4
  ) {
    return null;
  }
  const trend: PulseTrend =
    percentChange > 1 ? "up" : percentChange < -1 ? "down" : "flat";
  return {
    trend,
    percentChange,
    currentPlays: totalPlaysCurrent,
    previousPlays: totalPlaysPrevious,
  };
}

function buildSoundShift(
  cur: WindowStats,
  prev: WindowStats,
): PulseSoundShift | null {
  const minSamples = 5;
  if (
    cur.popSamples >= minSamples &&
    prev.popSamples >= minSamples &&
    cur.avgPopularity != null &&
    prev.avgPopularity != null
  ) {
    const delta = cur.avgPopularity - prev.avgPopularity;
    if (Math.abs(delta) >= 2.5) {
      const rounded = Math.round(Math.abs(delta));
      if (delta > 0) {
        return {
          trend: "up",
          headline: "More mainstream",
          detail: `You've been playing more well-known songs this week.`,
        };
      }
      return {
        trend: "down",
        headline: "More hidden gems",
        detail: `You've been playing more under-the-radar music this week.`,
      };
    }
  }

  if (prev.uniqueArtists >= 3 && cur.playCount >= 5 && prev.playCount >= 5) {
    const ratio = cur.uniqueArtists / Math.max(prev.uniqueArtists, 1);
    if (ratio >= 1.2) {
      return {
        trend: "up",
        headline: "More variety",
        detail: `You listened to ${cur.uniqueArtists} different artists this week, up from ${prev.uniqueArtists} last week.`,
      };
    }
    if (ratio <= 0.82) {
      return {
        trend: "down",
        headline: "Sticking to your favorites",
        detail: `You listened to ${cur.uniqueArtists} different artists this week, down from ${prev.uniqueArtists} last week.`,
      };
    }
  }

  return null;
}

/**
 * Rolling **last 7 days** vs **prior 7 days** (UTC instants), from `logs` — not
 * calendar weeks so the pulse stays populated right after week boundaries.
 */
export async function getProfilePulseInsights(
  userId: string,
): Promise<ProfilePulseInsights | null> {
  const uid = userId?.trim();
  if (!uid) return null;

  // Play-volume counts use the rolling 7-day window (fair comparison regardless
  // of day-of-week). Artist/genre movers and soundShift come from calendar-week
  // aggregates, but on Mondays the current-week bucket is empty.  A pre-flight
  // count decides whether to compare current vs previous, or previous vs two-weeks-ago.
  const { current, previous } = getRolling7dVsPrior7dBounds();
  const rangeCaption = "This week · vs last week";
  const admin = createSupabaseAdminClient();

  // Find the two most recent calendar weeks that have artist aggregate data.
  // On Mondays the current-week bucket is empty, and some weeks may be missing
  // artist rows entirely (tracks logged before Spotify enrichment ran).
  const { data: weekRows } = await admin
    .from("user_listening_aggregates")
    .select("week_start")
    .eq("user_id", uid)
    .eq("entity_type", "artist")
    .not("week_start", "is", null)
    .order("week_start", { ascending: false })
    .limit(20);

  const artistWeeks = [
    ...new Set((weekRows ?? []).map((r) => r.week_start as string)),
  ].filter(Boolean).slice(0, 2);

  const effectiveCurWeek = artistWeeks[0] ?? currentWeekStart();
  const effectivePrevWeek = artistWeeks[1] ?? previousWeekStart();

  const [artistCmp, genreCmp, curIds, curWindow, prevWindow] =
    await Promise.all([
      getListeningReportsRollingCompare({
        userId: uid,
        entityType: "artist",
      }),
      getListeningReportsRollingCompare({
        userId: uid,
        entityType: "genre",
      }),
      getTopArtistIdsForLogWindow(
        uid,
        current.startIso,
        current.endExclusiveIso,
        24,
      ),
      listeningWindowStats(uid, effectiveCurWeek),
      listeningWindowStats(uid, effectivePrevWeek),
    ]);

  const firstListenMap = await getFirstListenAtForArtists(uid, curIds);
  const windowStart = current.startIso;
  const freshIds = curIds
    .filter((id) => {
      const t = firstListenMap.get(id);
      return t != null && t >= windowStart;
    })
    .slice(0, 6);
  const nameMap =
    freshIds.length > 0 ? await resolveArtistNames(admin, freshIds) : new Map();
  const newNames = freshIds
    .map((id) => nameMap.get(id))
    .filter((n): n is string => Boolean(n?.trim()));

  const playVolume = volumeFromCompare(artistCmp);
  const genreChange = pickChartMover(genreCmp, "Genre");
  const artistChange = pickChartMover(artistCmp, "Artist");
  const discoveries =
    newNames.length > 0 ? { names: newNames } : null;
  const soundShift = buildSoundShift(curWindow, prevWindow);

  const hasAny =
    playVolume != null ||
    genreChange != null ||
    artistChange != null ||
    discoveries != null ||
    soundShift != null;

  if (!hasAny) return null;

  return {
    rangeCaption,
    playVolume,
    genreChange,
    artistChange,
    discoveries,
    soundShift,
  };
}
