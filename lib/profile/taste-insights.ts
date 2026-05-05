import "server-only";

import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const CHUNK = 200;
const LOG_LIMIT = 2000;
const MS_30 = 30 * 24 * 60 * 60 * 1000;
const MS_90 = 90 * 24 * 60 * 60 * 1000;

// ─── Public types ─────────────────────────────────────────────────────────────

export type TasteArcResult = {
  kind: "shifting" | "stable" | "exploring" | "deepening" | "insufficient";
  narrative: string;
  risingArtists: { id: string; name: string }[];
  stableArtists: { id: string; name: string }[];
};

export type DiscoveryStyleResult = {
  kind: "deep-diver" | "steady-explorer" | "skimmer" | "loyal" | "insufficient";
  narrative: string;
  newArtistsCount: number;
  revisitRate: number;
  recentFinds: { id: string; name: string; plays: number }[];
};

export type TasteInsightsResult = {
  arc: TasteArcResult;
  discovery: DiscoveryStyleResult;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(n: number) {
  return Math.round(n * 100);
}

function join2(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// ─── Core computation ─────────────────────────────────────────────────────────

async function computeTasteInsights(userId: string): Promise<TasteInsightsResult> {
  const admin = createSupabaseAdminClient();

  const INSUF_ARC: TasteArcResult = {
    kind: "insufficient",
    narrative: "Log more music to see how your taste is evolving.",
    risingArtists: [],
    stableArtists: [],
  };
  const INSUF_DISC: DiscoveryStyleResult = {
    kind: "insufficient",
    narrative: "Log more music to see your discovery patterns.",
    newArtistsCount: 0,
    revisitRate: 0,
    recentFinds: [],
  };

  const now = Date.now();
  const recent30Start = new Date(now - MS_30).toISOString();
  const older90Start = new Date(now - MS_90).toISOString();

  // Fetch both windows in parallel
  const [{ data: recentLogs }, { data: olderLogs }] = await Promise.all([
    admin
      .from("listening_logs")
      .select("track_id")
      .eq("user_id", userId)
      .gte("listened_at", recent30Start)
      .limit(LOG_LIMIT),
    admin
      .from("listening_logs")
      .select("track_id")
      .eq("user_id", userId)
      .gte("listened_at", older90Start)
      .lt("listened_at", recent30Start)
      .limit(LOG_LIMIT),
  ]);

  if ((recentLogs?.length ?? 0) < 5) {
    return { arc: INSUF_ARC, discovery: INSUF_DISC };
  }

  // Count plays per track
  const recentTrackPlays = new Map<string, number>();
  for (const { track_id } of recentLogs ?? []) {
    if (track_id) recentTrackPlays.set(track_id, (recentTrackPlays.get(track_id) ?? 0) + 1);
  }
  const olderTrackPlays = new Map<string, number>();
  for (const { track_id } of olderLogs ?? []) {
    if (track_id) olderTrackPlays.set(track_id, (olderTrackPlays.get(track_id) ?? 0) + 1);
  }

  // Resolve all track IDs → artist IDs in one batched pass
  const allTrackIds = [...new Set([...recentTrackPlays.keys(), ...olderTrackPlays.keys()])];
  const trackArtistMap = new Map<string, string>();
  for (let i = 0; i < allTrackIds.length; i += CHUNK) {
    const { data: rows } = await admin
      .from("tracks")
      .select("id, artist_id")
      .in("id", allTrackIds.slice(i, i + CHUNK));
    for (const r of rows ?? []) {
      if (r.id && r.artist_id) trackArtistMap.set(r.id, r.artist_id);
    }
  }

  // Aggregate plays per artist per window
  const recentArtistPlays = new Map<string, number>();
  for (const [tid, plays] of recentTrackPlays) {
    const aid = trackArtistMap.get(tid);
    if (aid) recentArtistPlays.set(aid, (recentArtistPlays.get(aid) ?? 0) + plays);
  }
  const olderArtistPlays = new Map<string, number>();
  for (const [tid, plays] of olderTrackPlays) {
    const aid = trackArtistMap.get(tid);
    if (aid) olderArtistPlays.set(aid, (olderArtistPlays.get(aid) ?? 0) + plays);
  }

  if (recentArtistPlays.size < 3) return { arc: INSUF_ARC, discovery: INSUF_DISC };

  // ── TASTE ARC ────────────────────────────────────────────────────────────────

  const topRecent = [...recentArtistPlays.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id);
  const topOlder = [...olderArtistPlays.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([id]) => id);

  const olderTopSet = new Set(topOlder);
  const risingIds = topRecent.filter((id) => !olderTopSet.has(id));
  const stableIds = topRecent.filter((id) => olderTopSet.has(id));
  const overlapRate = stableIds.length / Math.max(topRecent.length, 1);

  // ── DISCOVERY STYLE ──────────────────────────────────────────────────────────

  const recentArtistIds = [...recentArtistPlays.keys()];
  const olderArtistSet = new Set(olderArtistPlays.keys());

  const newArtistIds = recentArtistIds.filter((id) => !olderArtistSet.has(id));
  const revisitedCount = newArtistIds.filter(
    (id) => (recentArtistPlays.get(id) ?? 0) > 2,
  ).length;
  const revisitRate = newArtistIds.length > 0 ? revisitedCount / newArtistIds.length : 0;
  const discoveryRate =
    recentArtistIds.length > 0 ? newArtistIds.length / recentArtistIds.length : 0;

  // Fetch artist names for everything we need in one query
  const topNewIds = newArtistIds
    .sort((a, b) => (recentArtistPlays.get(b) ?? 0) - (recentArtistPlays.get(a) ?? 0))
    .slice(0, 4);

  const idsToFetch = [
    ...new Set([...risingIds.slice(0, 3), ...stableIds.slice(0, 2), ...topNewIds]),
  ];

  const { data: artistRows } = await admin
    .from("artists")
    .select("id, name")
    .in("id", idsToFetch.length > 0 ? idsToFetch : ["__none__"]);

  const nameMap = new Map(
    (artistRows ?? []).map((a) => [a.id, a.name as string]),
  );

  const risingArtists = risingIds
    .slice(0, 3)
    .map((id) => ({ id, name: nameMap.get(id) ?? "" }))
    .filter((a) => a.name);
  const stableArtists = stableIds
    .slice(0, 2)
    .map((id) => ({ id, name: nameMap.get(id) ?? "" }))
    .filter((a) => a.name);
  const recentFinds = topNewIds
    .map((id) => ({ id, name: nameMap.get(id) ?? "", plays: recentArtistPlays.get(id) ?? 1 }))
    .filter((a) => a.name);

  // ── CLASSIFY + NARRATE ───────────────────────────────────────────────────────

  let arcKind: TasteArcResult["kind"];
  let arcNarrative: string;

  if (olderArtistPlays.size < 3) {
    arcKind = "insufficient";
    arcNarrative = "Not enough history yet to track your taste arc.";
  } else if (overlapRate < 0.2) {
    arcKind = "exploring";
    const names = join2(risingArtists.slice(0, 2).map((a) => a.name));
    arcNarrative = names
      ? `Your rotation has changed dramatically over the past two months — ${names} ${risingArtists.length === 1 ? "is" : "are"} leading a big shift.`
      : "Your listening has changed dramatically from two months ago — you're in full exploration mode.";
  } else if (overlapRate < 0.5) {
    arcKind = "shifting";
    const rising = join2(risingArtists.slice(0, 2).map((a) => a.name));
    const anchor = stableArtists[0]?.name ?? "";
    arcNarrative = rising
      ? anchor
        ? `Your taste is shifting. ${rising} ${risingArtists.length === 1 ? "has entered" : "have entered"} your heavy rotation while ${anchor} remains a constant.`
        : `Your taste is shifting. ${rising} ${risingArtists.length === 1 ? "has" : "have"} entered your heavy rotation this month.`
      : "Your listening has shifted noticeably over the past two months.";
  } else if (overlapRate >= 0.75) {
    arcKind = "deepening";
    const names = join2(stableArtists.map((a) => a.name));
    arcNarrative = names
      ? `Going deep. ${names} ${stableArtists.length === 1 ? "has" : "have"} been anchoring your rotation for months straight.`
      : "Your taste is consistent — you know what you like and you're going deep on it.";
  } else {
    arcKind = "stable";
    const names = join2(stableArtists.map((a) => a.name));
    arcNarrative = names
      ? `Mostly steady. ${names} ${stableArtists.length === 1 ? "is" : "are"} still leading your rotation with some new additions.`
      : "Your rotation is largely consistent with some fresh additions this month.";
  }

  let discKind: DiscoveryStyleResult["kind"];
  let discNarrative: string;

  if (recentArtistIds.length < 4) {
    discKind = "insufficient";
    discNarrative = "Not enough data yet to classify your discovery style.";
  } else if (discoveryRate < 0.15) {
    discKind = "loyal";
    discNarrative = `Sticking close to what you know — only ${pct(discoveryRate)}% of your recent plays were artists you hadn't played before.`;
  } else if (revisitRate > 0.6 && newArtistIds.length >= 3) {
    discKind = "deep-diver";
    const finds = join2(recentFinds.slice(0, 2).map((f) => f.name));
    discNarrative = finds
      ? `When you find something new, you go all in. ${pct(revisitRate)}% of your recent discoveries — including ${finds} — got multiple plays within the month.`
      : `When you find something new, you go all in. ${pct(revisitRate)}% of your recent finds got multiple plays within the month.`;
  } else if (discoveryRate > 0.45) {
    discKind = "skimmer";
    discNarrative = `You're in active discovery mode — ${newArtistIds.length} new artists this month. You tend to take one listen and move on rather than going deep.`;
  } else {
    discKind = "steady-explorer";
    const finds = join2(recentFinds.slice(0, 2).map((f) => f.name));
    discNarrative = finds
      ? `A steady mix — ${newArtistIds.length} new artists alongside your regulars this month. ${finds} ${recentFinds.length === 1 ? "stands" : "stand"} out as recent finds.`
      : `A steady mix of familiar and new — ${newArtistIds.length} new artists this month.`;
  }

  return {
    arc: { kind: arcKind, narrative: arcNarrative, risingArtists, stableArtists },
    discovery: {
      kind: discKind,
      narrative: discNarrative,
      newArtistsCount: newArtistIds.length,
      revisitRate,
      recentFinds,
    },
  };
}

export const getTasteInsights = cache(computeTasteInsights);
