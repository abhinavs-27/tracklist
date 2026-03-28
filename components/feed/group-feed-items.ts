import type { FeedActivity } from "@/types";

/** Enriched feed activity with optional spotifyName (reviews). */
export type EnrichedFeedActivity = FeedActivity & { spotifyName?: string };

export function feedItemKey(activity: EnrichedFeedActivity): string {
  if (activity.type === "review") return activity.review.id;
  if (activity.type === "follow") return activity.id;
  if (activity.type === "feed_story") return `story-${activity.id}`;
  if (activity.type === "listen_sessions_summary")
    return `summary-${activity.user_id}-${activity.created_at}`;
  return `${activity.user_id}-${activity.album_id}-${activity.created_at}`;
}

export type FeedListenSessionActivity = Extract<FeedActivity, { type: "listen_session" }>;

/** One logical row: a single activity or consecutive same-user listen sessions merged. */
export type FeedRow =
  | { kind: "single"; activity: EnrichedFeedActivity }
  | { kind: "listen_group"; sessions: FeedListenSessionActivity[] };

/**
 * Merge adjacent `listen_session` items for the same user into one session card.
 * Other activity types stay as single rows (including `listen_sessions_summary` from the API).
 */
export function groupConsecutiveListenSessions(items: EnrichedFeedActivity[]): FeedRow[] {
  const rows: FeedRow[] = [];
  let i = 0;
  while (i < items.length) {
    const a = items[i];
    if (a.type === "listen_session") {
      const sessions: FeedListenSessionActivity[] = [a];
      let j = i + 1;
      while (j < items.length) {
        const next = items[j];
        if (next.type !== "listen_session") break;
        if (next.user_id !== a.user_id) break;
        sessions.push(next);
        j += 1;
      }
      if (sessions.length === 1) {
        rows.push({ kind: "single", activity: a });
      } else {
        rows.push({ kind: "listen_group", sessions });
      }
      i = j;
    } else {
      rows.push({ kind: "single", activity: a });
      i += 1;
    }
  }
  return rows;
}

/** Stable key for virtual list / React reconciliation. */
export function feedRowKey(row: FeedRow, index: number): string {
  if (row.kind === "single") return feedItemKey(row.activity);
  const s = row.sessions[0];
  return `listen-group-${s.user_id}-${s.created_at}-${row.sessions.length}-${index}`;
}
