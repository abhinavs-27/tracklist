import type { CommunityMemberRosterEntry } from "@/lib/community/community-member-roster-types";

/**
 * Attach taste-match % and similar/opposite styling from full weekly scores (median split).
 */
export function enrichRosterWithTasteScores(
  roster: CommunityMemberRosterEntry[],
  scores: Map<string, number>,
): CommunityMemberRosterEntry[] {
  const vals = [...scores.values()].sort((a, b) => a - b);
  const median = vals.length ? vals[Math.floor(vals.length / 2)] : 0.5;

  return roster.map((r) => {
    const s = scores.get(r.user_id);
    if (s === undefined) return r;
    const similarity_pct = Math.round(s * 100);
    const kind: "similar" | "opposite" = s >= median ? "similar" : "opposite";
    return { ...r, taste_neighbor: { similarity_pct, kind } };
  });
}
