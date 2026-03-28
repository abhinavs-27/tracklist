import type { CommunityFeedItemV2 } from "./api-communities";

export type CommunityFeedGrouped =
  | { kind: "single"; item: CommunityFeedItemV2 }
  | {
      kind: "group";
      items: CommunityFeedItemV2[];
      userId: string;
      username: string;
      avatar_url: string | null;
    };

function isListenRow(i: CommunityFeedItemV2): boolean {
  return (
    i.badge === "listen" ||
    i.event_type === "listen_session" ||
    i.event_type === "listen_sessions_summary"
  );
}

/**
 * Merge consecutive listen-style rows from the same member into one card.
 */
export function groupCommunityFeedItems(
  items: CommunityFeedItemV2[],
): CommunityFeedGrouped[] {
  if (items.length === 0) return [];
  const out: CommunityFeedGrouped[] = [];
  let run: CommunityFeedItemV2[] = [items[0]];

  function flush() {
    if (run.length === 0) return;
    if (run.length === 1) {
      out.push({ kind: "single", item: run[0] });
    } else {
      out.push({
        kind: "group",
        items: run,
        userId: run[0].user_id,
        username: run[0].username,
        avatar_url: run[0].avatar_url,
      });
    }
  }

  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1];
    const cur = items[i];
    const batch =
      prev.user_id === cur.user_id &&
      isListenRow(prev) &&
      isListenRow(cur) &&
      run.length < 8;
    if (batch) {
      run.push(cur);
    } else {
      flush();
      run = [cur];
    }
  }
  flush();
  return out;
}
