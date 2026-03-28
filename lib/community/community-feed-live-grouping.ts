import type { CommunityFeedItemV2 } from "@/lib/community/community-feed-types";

const MS_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Album ids that appear multiple times on this page (listens + album reviews). */
export function computeTrendingAlbumIds(
  items: CommunityFeedItemV2[],
): Set<string> {
  const counts = new Map<string, number>();
  for (const it of items) {
    if (it.event_type === "review" && it.entity_type === "album" && it.entity_id) {
      counts.set(it.entity_id, (counts.get(it.entity_id) ?? 0) + 1);
    }
    if (it.event_type === "listen_session") {
      const aid = String(it.payload?.album_id ?? "").trim();
      if (aid) counts.set(aid, (counts.get(aid) ?? 0) + 1);
    }
    if (it.event_type === "listen_sessions_summary") {
      const sessions = (
        it.payload as { sessions?: { album_id?: string | null }[] }
      )?.sessions;
      for (const s of sessions ?? []) {
        const aid = String(s?.album_id ?? "").trim();
        if (aid) counts.set(aid, (counts.get(aid) ?? 0) + 1);
      }
    }
  }
  const trending = new Set<string>();
  for (const [id, n] of counts) {
    if (n >= 2) trending.add(id);
  }
  return trending;
}

export function isAlbumTrendingOnPage(
  item: CommunityFeedItemV2,
  trendingIds: Set<string>,
): boolean {
  if (item.event_type === "review" && item.entity_type === "album" && item.entity_id) {
    return trendingIds.has(item.entity_id);
  }
  if (item.event_type === "listen_session") {
    const aid = String(item.payload?.album_id ?? "").trim();
    return aid ? trendingIds.has(aid) : false;
  }
  if (item.event_type === "listen_sessions_summary") {
    const sessions = (
      item.payload as { sessions?: { album_id?: string }[] }
    )?.sessions;
    const first = sessions?.[0]?.album_id;
    return first ? trendingIds.has(first) : false;
  }
  return false;
}

export type LiveFeedRow =
  | { kind: "section"; id: string; title: string }
  | {
      kind: "album_listen_cluster";
      id: string;
      albumId: string;
      items: CommunityFeedItemV2[];
      uniqueUserCount: number;
      latestAt: string;
      artworkUrl: string | null;
    }
  | { kind: "item"; item: CommunityFeedItemV2; trending: boolean };

function isReviewThisWeek(it: CommunityFeedItemV2, sinceMs: number): boolean {
  return (
    it.event_type === "review" &&
    new Date(it.created_at).getTime() >= sinceMs
  );
}

/**
 * Builds grouped rows: review section header, album listen clusters (2+ members
 * on same album, consecutive in the feed), and single items.
 */
export function buildLiveFeedRows(
  items: CommunityFeedItemV2[],
  filter: "all" | "listens" | "reviews" | "streaks" | "members",
): LiveFeedRow[] {
  const trendingIds = computeTrendingAlbumIds(items);
  const rows: LiveFeedRow[] = [];
  const sinceWeek = Date.now() - MS_WEEK;
  let insertedReviewSection = false;
  let i = 0;

  const wantReviewHeader =
    filter === "all" || filter === "reviews";

  while (i < items.length) {
    const it = items[i];

    if (
      wantReviewHeader &&
      !insertedReviewSection &&
      isReviewThisWeek(it, sinceWeek)
    ) {
      rows.push({
        kind: "section",
        id: "live-reviews-this-week",
        title: "New reviews this week",
      });
      insertedReviewSection = true;
    }

    if (
      it.event_type === "listen_session" &&
      (filter === "all" || filter === "listens")
    ) {
      const albumId = String(it.payload?.album_id ?? "").trim();
      if (albumId) {
        const run: CommunityFeedItemV2[] = [it];
        let j = i + 1;
        while (j < items.length) {
          const next = items[j];
          if (next.event_type !== "listen_session") break;
          const aid = String(next.payload?.album_id ?? "").trim();
          if (aid !== albumId) break;
          run.push(next);
          j++;
        }
        const users = new Set(run.map((r) => r.user_id));
        if (run.length >= 2 && users.size >= 2) {
          rows.push({
            kind: "album_listen_cluster",
            id: `cluster:${albumId}:${run[0].id}`,
            albumId,
            items: run,
            uniqueUserCount: users.size,
            latestAt: run[0].created_at,
            artworkUrl: run[0].artwork_url ?? null,
          });
          i = j;
          continue;
        }
      }
    }

    rows.push({
      kind: "item",
      item: it,
      trending: isAlbumTrendingOnPage(it, trendingIds),
    });
    i++;
  }

  return rows;
}
