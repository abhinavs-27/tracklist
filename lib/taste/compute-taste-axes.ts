import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AxisScore, TasteAxes, TasteStyleResult } from "./types";
import type { TasteListeningStyle } from "./listening-style";
import { getAllTimeAgg, getTotalPlayCount } from "@/lib/analytics/from-aggregates";

// ── Core primitive ────────────────────────────────────────────────────────────

export function makeAxisScore(score: number): AxisScore {
  const s = Math.round(Math.min(100, Math.max(0, score)));
  return {
    score: s,
    deviation: Math.abs(s - 50),
    pole: s > 60 ? "right" : s < 40 ? "left" : "neutral",
  };
}

// ── Axis 1: RANGE ─────────────────────────────────────────────────────────────

export function scoreRange(uniqueArtists: number, totalPlays: number): AxisScore {
  if (totalPlays < 100) return makeAxisScore(50);
  const ratio = uniqueArtists / totalPlays;
  let score: number;
  if (ratio >= 0.45) {
    score = 70 + Math.min(30, ((ratio - 0.45) / 0.55) * 30);
  } else if (ratio <= 0.10) {
    score = 30 - Math.min(30, ((0.10 - ratio) / 0.10) * 30);
  } else {
    score = 30 + ((ratio - 0.10) / 0.35) * 40;
  }
  return makeAxisScore(score);
}

async function computeRangeAxis(admin: SupabaseClient, userId: string): Promise<AxisScore> {
  const [artistAgg, totalPlays] = await Promise.all([
    getAllTimeAgg(admin, userId, "artist", 2000),
    getTotalPlayCount(admin, userId),
  ]);
  return scoreRange(artistAgg.length, totalPlays);
}

// ── Axis 2: SIGNAL ────────────────────────────────────────────────────────────

export function scoreSignal(obscurityScore: number | null): AxisScore | null {
  if (obscurityScore === null) return null;
  const popularity = 100 - obscurityScore;
  let score: number;
  if (popularity > 65) {
    score = 70 + Math.min(30, ((popularity - 65) / 35) * 30);
  } else if (popularity < 40) {
    score = 30 - Math.min(30, ((40 - popularity) / 40) * 30);
  } else {
    score = 30 + ((popularity - 40) / 25) * 40;
  }
  return makeAxisScore(score);
}

// ── Axis 3: MODE ──────────────────────────────────────────────────────────────

export function scoreMode(
  maxWeeklyPlays: number,
  activeWeeks: number,
  totalWeeks: number,
): AxisScore {
  let sessionScore = 50;
  if (maxWeeklyPlays >= 350) sessionScore = 90;
  else if (maxWeeklyPlays >= 200) sessionScore = 80;
  else if (maxWeeklyPlays >= 100) sessionScore = 70;

  if (sessionScore >= 80) return makeAxisScore(sessionScore);

  const activeRate = totalWeeks > 0 ? activeWeeks / totalWeeks : 0;
  if (activeRate >= 0.75) return makeAxisScore(20);
  if (activeRate >= 0.60) return makeAxisScore(30);

  return makeAxisScore(50);
}

async function computeModeAxis(
  admin: SupabaseClient,
  userId: string,
): Promise<AxisScore | null> {
  const twelveWeeksAgo = new Date();
  twelveWeeksAgo.setUTCDate(twelveWeeksAgo.getUTCDate() - 84);
  const cutoff = twelveWeeksAgo.toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("user_listening_aggregates")
    .select("week_start, count")
    .eq("user_id", userId)
    .eq("entity_type", "track")
    .gte("week_start", cutoff)
    .not("week_start", "is", null);

  if (error || !data?.length) return null;

  const rows = data as Array<{ week_start: string; count: number }>;
  const weekTotals = new Map<string, number>();
  for (const r of rows) {
    weekTotals.set(r.week_start, (weekTotals.get(r.week_start) ?? 0) + r.count);
  }

  if (weekTotals.size < 4) return null;

  const weekValues = Array.from(weekTotals.values());
  const maxWeeklyPlays = Math.max(...weekValues);
  const activeWeeks = weekValues.filter((v) => v > 0).length;
  const totalWeeks = Math.min(12, weekTotals.size);

  return scoreMode(maxWeeklyPlays, activeWeeks, totalWeeks);
}

// ── Axis 4: DISCOVERY ─────────────────────────────────────────────────────────

async function computeDiscoveryAxis(
  admin: SupabaseClient,
  userId: string,
): Promise<AxisScore | null> {
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setUTCDate(fourWeeksAgo.getUTCDate() - 28);
  const cutoff4w = fourWeeksAgo.toISOString().slice(0, 10);

  const { data: earliest } = await admin
    .from("user_listening_aggregates")
    .select("week_start")
    .eq("user_id", userId)
    .eq("entity_type", "artist")
    .not("week_start", "is", null)
    .order("week_start", { ascending: true })
    .limit(1);

  if (!earliest?.length) return null;

  const earliestDate = new Date((earliest[0] as { week_start: string }).week_start);
  const weeksSince = Math.floor(
    (Date.now() - earliestDate.getTime()) / (7 * 24 * 60 * 60 * 1000),
  );
  if (weeksSince < 8) return null;

  const { data: recentPlays } = await admin
    .from("user_listening_aggregates")
    .select("entity_id, count")
    .eq("user_id", userId)
    .eq("entity_type", "artist")
    .gte("week_start", cutoff4w)
    .not("week_start", "is", null);

  const recentRows = (recentPlays ?? []) as Array<{ entity_id: string; count: number }>;
  const totalRecentPlays = recentRows.reduce((s, r) => s + r.count, 0);
  if (totalRecentPlays < 50) return null;

  const recentArtistIds = [...new Set(recentRows.map((r) => r.entity_id))];
  if (recentArtistIds.length === 0) return null;

  const { data: allEncounters } = await admin
    .from("user_listening_aggregates")
    .select("entity_id, week_start")
    .eq("user_id", userId)
    .eq("entity_type", "artist")
    .in("entity_id", recentArtistIds)
    .not("week_start", "is", null)
    .order("week_start", { ascending: true });

  const firstWeekByArtist = new Map<string, string>();
  for (const r of (allEncounters ?? []) as Array<{
    entity_id: string;
    week_start: string;
  }>) {
    const existing = firstWeekByArtist.get(r.entity_id);
    if (!existing || r.week_start < existing) {
      firstWeekByArtist.set(r.entity_id, r.week_start);
    }
  }

  const newArtistIds = new Set(
    Array.from(firstWeekByArtist.entries())
      .filter(([, first]) => first >= cutoff4w)
      .map(([id]) => id),
  );

  const newArtistPlays = recentRows
    .filter((r) => newArtistIds.has(r.entity_id))
    .reduce((s, r) => s + r.count, 0);

  const ratio = newArtistPlays / totalRecentPlays;

  let score: number;
  if (ratio > 0.35) {
    score = 70 + Math.min(30, ((ratio - 0.35) / 0.65) * 30);
  } else if (ratio < 0.05) {
    score = 30 - Math.min(30, ((0.05 - ratio) / 0.05) * 30);
  } else {
    score = 30 + ((ratio - 0.05) / 0.30) * 40;
  }

  return makeAxisScore(score);
}

// ── Primary + badge selection ─────────────────────────────────────────────────

type AxisCandidate = {
  axis: AxisScore;
  style: TasteListeningStyle;
  badge: string;
};

function axisToCandidate(
  axisScore: AxisScore,
  axisName: keyof TasteAxes,
): AxisCandidate | null {
  if (axisScore.deviation <= 15) return null;
  const { pole } = axisScore;
  const map: Record<
    keyof TasteAxes,
    [TasteListeningStyle, string, TasteListeningStyle, string]
  > = {
    range: ["the-devotee", "Devotee", "genre-nomad", "Nomad"],
    signal: ["the-archivist", "Underground", "cultural-pulse", "Mainstream"],
    mode: ["daily-ritual", "Ritual", "session-maximalist", "Sessions"],
    discovery: ["the-loyalist", "Loyalist", "the-explorer", "Explorer"],
  };
  const [leftStyle, leftBadge, rightStyle, rightBadge] = map[axisName];
  if (pole === "left") return { axis: axisScore, style: leftStyle, badge: leftBadge };
  if (pole === "right") return { axis: axisScore, style: rightStyle, badge: rightBadge };
  return null;
}

export function selectPrimaryAndBadge(axes: TasteAxes): {
  primary: TasteListeningStyle;
  badge: string | null;
} {
  const candidates: AxisCandidate[] = [];
  for (const [name, axis] of Object.entries(axes) as [keyof TasteAxes, AxisScore | null][]) {
    if (!axis) continue;
    const c = axisToCandidate(axis, name);
    if (c) candidates.push(c);
  }

  if (candidates.length === 0) return { primary: "well-rounded", badge: null };

  candidates.sort((a, b) => b.axis.deviation - a.axis.deviation);

  const primary = candidates[0]!.style;
  const second = candidates[1];
  const badge = second && second.axis.deviation > 15 ? second.badge : null;

  return { primary, badge };
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function computeTasteAxes(
  admin: SupabaseClient,
  userId: string,
  obscurityScore: number | null,
): Promise<TasteStyleResult> {
  const [range, mode, discovery] = await Promise.all([
    computeRangeAxis(admin, userId),
    computeModeAxis(admin, userId),
    computeDiscoveryAxis(admin, userId),
  ]);

  const signal = scoreSignal(obscurityScore);
  const axes: TasteAxes = { range, signal, mode, discovery };
  const { primary, badge } = selectPrimaryAndBadge(axes);

  return { primary, badge, axes };
}
