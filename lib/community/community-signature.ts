import "server-only";

import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SignatureRole =
  | "pioneer"      // brings genres nobody else plays
  | "deep-diver"   // goes deepest on the community's shared genres
  | "wildcard"     // taste barely overlaps with the community
  | "backbone"     // core listener, anchors the community sound
  | "curator"      // has artists uniquely their own
  | "insufficient";

export type SignatureArtist = {
  id: string;
  name: string;
  imageUrl?: string;
};

export type CommunitySignatureResult = {
  role: SignatureRole;
  roleLabel: string;
  narrative: string;
  signatureGenres: string[];   // genres the viewer plays notably more than the community avg
  uniqueArtists: SignatureArtist[]; // top artists that few other members play
  memberCount: number;
  hasData: boolean;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<SignatureRole, string> = {
  pioneer:      "Pioneer",
  "deep-diver": "Deep diver",
  wildcard:     "Wildcard",
  backbone:     "Backbone",
  curator:      "Curator",
  insufficient: "",
};

// Months of snapshot history to look at
const LOOKBACK_MONTHS = 3;
const SIGNATURE_RATIO = 2.0;   // user plays genre N× more than community avg
const UNIQUE_THRESHOLD = 0.15; // artist is "unique" if ≤15% of members also have it

// ─── Helpers ──────────────────────────────────────────────────────────────────

function recentMonths(n: number): string[] {
  const months: string[] = [];
  const d = new Date();
  for (let i = 1; i <= n; i++) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    months.push(`${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-01`);
  }
  return months;
}

type SnapshotRow = {
  user_id: string;
  top_genres: { name: string; weight: number }[];
  top_artists: { id: string; name: string; plays: number; imageUrl?: string }[];
};

/** Aggregate genre weights for a set of snapshots (multiple months per user). */
function aggregateGenres(
  rows: SnapshotRow[],
  forUserId?: string,
): Map<string, number> {
  // Per-user maps then average across users to avoid heavy listeners dominating
  const byUser = new Map<string, Map<string, number>>();
  for (const r of rows) {
    if (forUserId && r.user_id !== forUserId) continue;
    if (!forUserId && r.user_id === "") continue;
    const uid = r.user_id;
    if (!byUser.has(uid)) byUser.set(uid, new Map());
    const m = byUser.get(uid)!;
    for (const { name, weight } of r.top_genres ?? []) {
      m.set(name, Math.max(m.get(name) ?? 0, weight));
    }
  }
  // Average across users
  const totals = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const userMap of byUser.values()) {
    for (const [genre, w] of userMap) {
      totals.set(genre, (totals.get(genre) ?? 0) + w);
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }
  const result = new Map<string, number>();
  for (const [genre, total] of totals) {
    result.set(genre, total / (counts.get(genre) ?? 1));
  }
  return result;
}

/** Aggregate top artists for a user across months. */
function aggregateUserArtists(rows: SnapshotRow[], userId: string) {
  const plays = new Map<string, { id: string; name: string; plays: number; imageUrl?: string }>();
  for (const r of rows) {
    if (r.user_id !== userId) continue;
    for (const a of r.top_artists ?? []) {
      const existing = plays.get(a.id);
      plays.set(a.id, {
        id: a.id,
        name: a.name,
        plays: (existing?.plays ?? 0) + a.plays,
        imageUrl: a.imageUrl ?? existing?.imageUrl,
      });
    }
  }
  return [...plays.values()].sort((a, b) => b.plays - a.plays);
}

// ─── Main computation ─────────────────────────────────────────────────────────

async function computeCommunitySignature(
  userId: string,
  communityId: string,
): Promise<CommunitySignatureResult> {
  const INSUFFICIENT: CommunitySignatureResult = {
    role: "insufficient",
    roleLabel: "",
    narrative: "",
    signatureGenres: [],
    uniqueArtists: [],
    memberCount: 0,
    hasData: false,
  };

  const admin = createSupabaseAdminClient();
  const months = recentMonths(LOOKBACK_MONTHS);
  const since = months[months.length - 1]!;

  // 1 — Community members
  const { data: memberRows, error: membErr } = await admin
    .from("community_members")
    .select("user_id")
    .eq("community_id", communityId);

  if (membErr || !memberRows || memberRows.length < 3) return INSUFFICIENT;

  const memberIds = memberRows.map((r) => r.user_id as string);
  if (!memberIds.includes(userId)) return INSUFFICIENT;

  // 2 — Snapshots for all members in the lookback window
  const { data: snapshots, error: snapErr } = await admin
    .from("taste_snapshots")
    .select("user_id, top_genres, top_artists")
    .in("user_id", memberIds)
    .gte("snapshot_month", since);

  if (snapErr || !snapshots) return INSUFFICIENT;

  const rows = snapshots as SnapshotRow[];
  const memberIdsWithData = new Set(rows.map((r) => r.user_id));

  // Need at least 3 other members with snapshot data to make comparison meaningful
  const othersWithData = memberIds.filter((id) => id !== userId && memberIdsWithData.has(id));
  if (othersWithData.length < 2) return INSUFFICIENT;

  // 3 — Genre profiles
  const userGenres = aggregateGenres(rows, userId);
  const communityGenres = aggregateGenres(rows.filter((r) => r.user_id !== userId));

  if (userGenres.size === 0) return INSUFFICIENT;

  // 4 — Signature genres: user weight / community avg > SIGNATURE_RATIO
  //     Also flag genres user plays that community barely touches (community avg < 0.05)
  const topUserGenres = [...userGenres.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const communityTopGenreNames = new Set(
    [...communityGenres.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([g]) => g),
  );

  const signatureGenres: string[] = [];
  for (const [genre, userWeight] of topUserGenres) {
    const commWeight = communityGenres.get(genre) ?? 0;
    const ratio = commWeight < 0.01 ? 10 : userWeight / commWeight;
    if (ratio >= SIGNATURE_RATIO) {
      signatureGenres.push(genre);
    }
    if (signatureGenres.length >= 4) break;
  }

  // 5 — Unique artists: in user's top, played by few other members
  const userArtists = aggregateUserArtists(rows, userId).slice(0, 10);

  // Count how many OTHER members have each artist in their top artists
  const artistMemberCount = new Map<string, number>();
  for (const r of rows) {
    if (r.user_id === userId) continue;
    for (const a of r.top_artists ?? []) {
      artistMemberCount.set(a.id, (artistMemberCount.get(a.id) ?? 0) + 1);
    }
  }

  const totalOthers = othersWithData.length;
  const uniqueArtists: SignatureArtist[] = userArtists
    .filter((a) => {
      const listenerCount = artistMemberCount.get(a.id) ?? 0;
      return listenerCount / totalOthers <= UNIQUE_THRESHOLD;
    })
    .slice(0, 4)
    .map((a) => ({ id: a.id, name: a.name, imageUrl: a.imageUrl }));

  // 6 — Genre overlap score (for role classification)
  const topUserGenreNames = new Set(
    [...userGenres.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([g]) => g),
  );

  const overlap = [...topUserGenreNames].filter((g) => communityTopGenreNames.has(g)).length;
  const overlapRate = overlap / Math.max(topUserGenreNames.size, 1);

  // 7 — Classify role
  let role: SignatureRole;

  const hasPioneerGenres = signatureGenres.some((g) => !communityTopGenreNames.has(g));
  const hasUniqueArtists = uniqueArtists.length >= 2;

  if (overlapRate < 0.2 && signatureGenres.length >= 2) {
    role = "pioneer";
  } else if (overlapRate >= 0.6 && signatureGenres.length >= 2) {
    role = "deep-diver";
  } else if (overlapRate < 0.3) {
    role = hasPioneerGenres ? "pioneer" : "wildcard";
  } else if (overlapRate >= 0.6) {
    role = hasUniqueArtists ? "curator" : "backbone";
  } else if (hasUniqueArtists && hasPioneerGenres) {
    role = "curator";
  } else if (signatureGenres.length >= 2) {
    role = "pioneer";
  } else {
    role = "backbone";
  }

  // 8 — Narrative
  const topSig = signatureGenres.slice(0, 2).join(" and ");
  const topUnique = uniqueArtists.slice(0, 2).map((a) => a.name).join(" and ");

  let narrative: string;
  switch (role) {
    case "pioneer":
      narrative = topSig
        ? `You bring ${topSig} to this community — genres most members here barely touch.`
        : "You consistently listen to music outside what the rest of this community gravitates toward.";
      break;
    case "deep-diver":
      narrative = topSig
        ? `You go deeper on ${topSig} than almost anyone else here — same lane, but further down.`
        : "You go deeper into the community's shared sound than most members do.";
      break;
    case "wildcard":
      narrative = "Your taste barely overlaps with this community's. You're the wildcard — which means you're probably bringing things nobody else has heard of.";
      break;
    case "curator":
      narrative = topUnique
        ? `${topUnique} ${uniqueArtists.length === 1 ? "is" : "are"} almost entirely yours in this community — you're setting the agenda for artists others haven't caught up to yet.`
        : "You have a set of artists that are almost entirely yours in this community.";
      break;
    case "backbone":
      narrative = "Your listening anchors this community's sound. You reliably play what others play — you're core to the collective taste.";
      break;
    default:
      narrative = "";
  }

  return {
    role,
    roleLabel: ROLE_LABELS[role],
    narrative,
    signatureGenres,
    uniqueArtists,
    memberCount: memberIds.length,
    hasData: true,
  };
}

export const getCommunitySignature = cache(computeCommunitySignature);
