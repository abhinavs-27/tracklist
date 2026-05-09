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
    arcNarrative = "Log more music to see how your taste is changing over time.";
  } else if (overlapRate < 0.2) {
    arcKind = "exploring";
    const names = join2(risingArtists.slice(0, 2).map((a) => a.name));
    arcNarrative = names
      ? `Your taste has shifted a lot recently — ${names} ${risingArtists.length === 1 ? "is" : "are"} dominating your listening now.`
      : "Your taste has changed a lot over the past couple months — you're exploring new territory.";
  } else if (overlapRate < 0.5) {
    arcKind = "shifting";
    const rising = join2(risingArtists.slice(0, 2).map((a) => a.name));
    const anchor = stableArtists[0]?.name ?? "";
    arcNarrative = rising
      ? anchor
        ? `Your taste is evolving. You're playing ${rising} a lot more now while still keeping ${anchor} in the mix.`
        : `Your taste is evolving. You've been playing ${rising} a lot more this month.`
      : "Your listening has shifted a bit over the past couple months.";
  } else if (overlapRate >= 0.75) {
    arcKind = "deepening";
    const names = join2(stableArtists.map((a) => a.name));
    arcNarrative = names
      ? `You're really into ${names} — ${stableArtists.length === 1 ? "they've" : "they've"} been at the top of your listening for months.`
      : "Your taste is consistent — you know what you love and you keep coming back to it.";
  } else {
    arcKind = "stable";
    const names = join2(stableArtists.map((a) => a.name));
    arcNarrative = names
      ? `Pretty steady — ${names} ${stableArtists.length === 1 ? "is" : "are"} still at the top, with some new music mixed in.`
      : "Your taste is pretty consistent with a few new things added this month.";
  }

  let discKind: DiscoveryStyleResult["kind"];
  let discNarrative: string;

  if (recentArtistIds.length < 4) {
    discKind = "insufficient";
    discNarrative = "Log more music so we can see how you discover new artists.";
  } else if (discoveryRate < 0.15) {
    discKind = "loyal";
    discNarrative = `You mostly stick with artists you already love — only ${pct(discoveryRate)}% of your recent plays were artists you hadn't heard before.`;
  } else if (revisitRate > 0.6 && newArtistIds.length >= 3) {
    discKind = "deep-diver";
    const finds = join2(recentFinds.slice(0, 2).map((f) => f.name));
    discNarrative = finds
      ? `When you discover something new, you really commit. ${pct(revisitRate)}% of your recent finds — including ${finds} — got played multiple times this month.`
      : `When you discover something new, you really commit. You replayed ${pct(revisitRate)}% of your recent finds multiple times.`;
  } else if (discoveryRate > 0.45) {
    discKind = "skimmer";
    discNarrative = `You're exploring a lot — ${newArtistIds.length} new artists this month. You tend to listen once and move on rather than going back repeatedly.`;
  } else {
    discKind = "steady-explorer";
    const finds = join2(recentFinds.slice(0, 2).map((f) => f.name));
    discNarrative = finds
      ? `Good balance — ${newArtistIds.length} new artists this month alongside your regulars. ${finds} ${recentFinds.length === 1 ? "is" : "are"} a recent highlight.`
      : `Good balance of old and new — you've added ${newArtistIds.length} new artists this month.`;
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
