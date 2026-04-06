import "server-only";

import {
  getFirstListenAtForArtists,
  getListeningReportsRollingCompare,
  getTopArtistIdsForLogWindow,
} from "@/lib/analytics/getRollingReportsCompare";
import { getRolling7dVsPrior7dBounds } from "@/lib/analytics/rolling-windows";
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
  startIso: string,
  endExclusiveIso: string,
): Promise<WindowStats> {
  const admin = createSupabaseAdminClient();
  const { data: logs, error } = await admin
    .from("logs")
    .select("track_id, artist_id")
    .eq("user_id", userId)
    .gte("listened_at", startIso)
    .lt("listened_at", endExclusiveIso)
    .limit(12000);

  if (error) {
    console.warn("[profile-pulse] listeningWindowStats", error.message);
    return { playCount: 0, avgPopularity: null, popSamples: 0, uniqueArtists: 0 };
  }

  const rows = logs ?? [];
  const trackIds = [...new Set(rows.map((r) => r.track_id).filter(Boolean))] as string[];

  const songArtist = new Map<string, string>();
  if (trackIds.length > 0) {
    const chunk = 400;
    for (let i = 0; i < trackIds.length; i += chunk) {
      const slice = trackIds.slice(i, i + chunk);
      const { data: songs } = await admin
        .from("tracks")
        .select("id, artist_id")
        .in("id", slice);
      for (const s of songs ?? []) {
        const r = s as { id: string; artist_id: string | null };
        if (r.artist_id?.trim()) songArtist.set(r.id, r.artist_id.trim());
      }
    }
  }

  const artistIds = new Set<string>();
  for (const r of rows) {
    let a = r.artist_id?.trim() ?? null;
    if (!a && r.track_id) a = songArtist.get(r.track_id) ?? null;
    if (a) artistIds.add(a);
  }

  const popMap = await fetchPopularityMap(trackIds);
  let sum = 0;
  let nPop = 0;
  for (const r of rows) {
    const tid = r.track_id?.trim();
    if (!tid) continue;
    const p = popMap.get(tid);
    if (p != null) {
      sum += p;
      nPop++;
    }
  }

  return {
    playCount: rows.length,
    avgPopularity: nPop > 0 ? sum / nPop : null,
    popSamples: nPop,
    uniqueArtists: artistIds.size,
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
      caption: `${entityLabel} with the largest rank climb vs prior 7 days`,
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
      caption: `${entityLabel} with the largest rank slide vs prior 7 days`,
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
          headline: "More chart-oriented",
          detail: `Avg track popularity up ~${rounded} pts vs prior 7 days (Spotify 0–100) — more plays leaning mainstream.`,
        };
      }
      return {
        trend: "down",
        headline: "Deeper catalog",
        detail: `Avg track popularity down ~${rounded} pts vs prior 7 days — more deep cuts in the mix.`,
      };
    }
  }

  if (prev.uniqueArtists >= 3 && cur.playCount >= 5 && prev.playCount >= 5) {
    const ratio = cur.uniqueArtists / Math.max(prev.uniqueArtists, 1);
    if (ratio >= 1.2) {
      return {
        trend: "up",
        headline: "Broader rotation",
        detail: `You hit ${cur.uniqueArtists} distinct artists vs ${prev.uniqueArtists} in the prior 7 days.`,
      };
    }
    if (ratio <= 0.82) {
      return {
        trend: "down",
        headline: "Narrower rotation",
        detail: `You hit ${cur.uniqueArtists} distinct artists vs ${prev.uniqueArtists} in the prior 7 days.`,
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

  const { current, previous, rangeCaption } = getRolling7dVsPrior7dBounds();
  const admin = createSupabaseAdminClient();

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
      listeningWindowStats(uid, current.startIso, current.endExclusiveIso),
      listeningWindowStats(uid, previous.startIso, previous.endExclusiveIso),
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
