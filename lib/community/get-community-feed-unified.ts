import "server-only";

import type {
  CommunityFeedFilterV2,
  CommunityFeedItemV2,
} from "@/lib/community/community-feed-types";
import { buildLabel, badgeForType } from "@/lib/community/community-feed-labels";
import {
  COMMUNITY_FEED_TYPES,
} from "@/lib/community/community-feed-insert";
import {
  getCommunityFeedMerged,
  type CommunityFeedMergedItem,
} from "@/lib/community/community-feed-merged";
import { mapCommunityEventToFeedPayload } from "@/lib/community/map-community-event-to-feed";
import {
  batchCountFeedActivityComments,
} from "@/lib/community/feed-activity-comments";
import { fetchUserMap, getEntityDisplayNames } from "@/lib/queries";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getOrFetchAlbum,
  getOrFetchAlbumsBatch,
  getOrFetchTrack,
  getOrFetchTracksBatch,
} from "@/lib/spotify-cache";

type RawFeedRow = {
  id: string;
  community_id: string;
  user_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

/**
 * Supplemental rows stored only in `community_feed` (weekly roles, follows, list updates).
 * We intentionally omit `listen` / `review` here — those come from `logs` / `reviews` via
 * `getCommunityFeedMerged` to avoid duplicates with fan-out writes.
 */
function extrasEventTypes(
  filter: CommunityFeedFilterV2,
): string[] | null {
  if (filter === "listens" || filter === "reviews") return null;
  if (filter === "all") {
    return [
      COMMUNITY_FEED_TYPES.follow_in_community,
      COMMUNITY_FEED_TYPES.list_update,
      COMMUNITY_FEED_TYPES.streak_role,
    ];
  }
  if (filter === "streaks") {
    return [COMMUNITY_FEED_TYPES.streak_role];
  }
  if (filter === "members") {
    return [COMMUNITY_FEED_TYPES.follow_in_community];
  }
  return null;
}

async function fetchCommunityFeedExtras(
  communityId: string,
  filter: CommunityFeedFilterV2,
): Promise<RawFeedRow[]> {
  const types = extrasEventTypes(filter);
  if (!types?.length) return [];

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("community_feed")
    .select("id, community_id, user_id, event_type, payload, created_at")
    .eq("community_id", communityId)
    .in("event_type", types)
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    console.error("[community_feed] extras", error);
    return [];
  }

  const rows = (data ?? []) as RawFeedRow[];
  return rows.filter((r) => {
    if (r.event_type === COMMUNITY_FEED_TYPES.streak_role) {
      const p = (r.payload ?? {}) as Record<string, unknown>;
      return p.milestone === "Weekly community role";
    }
    return true;
  });
}

async function enrichCommunityFeedTableRows(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  raw: RawFeedRow[],
): Promise<CommunityFeedItemV2[]> {
  if (!raw.length) return [];

  const reviewRows = raw.filter(
    (r) => r.event_type === COMMUNITY_FEED_TYPES.review,
  );
  const reviewNameItems = reviewRows.map((r) => {
    const p = r.payload as Record<string, unknown>;
    return {
      entity_type:
        p.entity_type === "album" ? ("album" as const) : ("song" as const),
      entity_id: p.entity_id as string,
    };
  });
  const reviewNameMap =
    reviewNameItems.length > 0
      ? await getEntityDisplayNames(reviewNameItems)
      : new Map<string, string>();

  const userIds = [...new Set(raw.map((r) => r.user_id))];
  const userMap = await fetchUserMap(admin, userIds);

  const targetIds = [
    ...new Set(
      raw
        .filter((r) => r.event_type === COMMUNITY_FEED_TYPES.follow_in_community)
        .map((r) => (r.payload?.target_user_id as string) || "")
        .filter(Boolean),
    ),
  ];
  const targetMap =
    targetIds.length > 0 ? await fetchUserMap(admin, targetIds) : new Map();

  const listenTrackIds = [
    ...new Set(
      raw
        .filter((r) => r.event_type === COMMUNITY_FEED_TYPES.listen)
        .map((r) => (r.payload?.track_id as string) || "")
        .filter(Boolean),
    ),
  ];

  const tracks =
    listenTrackIds.length > 0
      ? await getOrFetchTracksBatch(listenTrackIds)
      : [];
  const trackMeta = new Map<
    string,
    {
      name: string;
      artists: { name: string }[];
      album?: { images?: { url: string }[] };
    }
  >();
  for (let i = 0; i < listenTrackIds.length; i++) {
    const tid = listenTrackIds[i];
    const t = tracks[i];
    if (t?.name) {
      trackMeta.set(tid, {
        name: t.name,
        artists: (t.artists as { name: string }[]) ?? [],
        album: t.album as { images?: { url: string }[] } | undefined,
      });
    }
  }

  return raw.map((r) => {
    const u = userMap.get(r.user_id);
    const username = u?.username ?? "Someone";
    let payload = (r.payload ?? {}) as Record<string, unknown>;
    if (r.event_type === COMMUNITY_FEED_TYPES.review) {
      const eid = payload.entity_id as string | undefined;
      if (eid) {
        const n = reviewNameMap.get(eid)?.trim();
        if (n) payload = { ...payload, entity_name: n };
      }
    }

    let trackName: string | null = null;
    let artistName: string | null = null;
    let artwork: string | null = null;
    if (r.event_type === COMMUNITY_FEED_TYPES.listen) {
      const tid = payload.track_id as string | undefined;
      if (tid) {
        const meta = trackMeta.get(tid);
        if (meta) {
          trackName = meta.name;
          artistName = meta.artists[0]?.name ?? null;
          artwork = meta.album?.images?.[0]?.url ?? null;
        }
      }
    }

    let targetUsername: string | null = null;
    if (r.event_type === COMMUNITY_FEED_TYPES.follow_in_community) {
      const tid = payload.target_user_id as string | undefined;
      if (tid) {
        targetUsername = targetMap.get(tid)?.username ?? null;
      }
    }

    const { label, sublabel } = buildLabel(r.event_type, payload, {
      trackName,
      artistName,
      targetUsername,
    });

    const base: CommunityFeedItemV2 = {
      id: r.id,
      community_id: r.community_id,
      user_id: r.user_id,
      event_type: r.event_type,
      payload,
      created_at: r.created_at,
      username,
      avatar_url: u?.avatar_url ?? null,
      label,
      sublabel,
      artwork_url: artwork,
      badge: badgeForType(r.event_type),
    };

    if (r.event_type === COMMUNITY_FEED_TYPES.review) {
      const et =
        (payload.entity_type as string) === "album" ? "album" : "song";
      const eid = (payload.entity_id as string) || "";
      if (eid) {
        const nm = (payload.entity_name as string)?.trim() || null;
        base.entity_type = et;
        base.entity_id = eid;
        base.entity_name = nm;
        base.entity_href = et === "album" ? `/album/${eid}` : `/song/${eid}`;
        base.review_id = (payload.review_id as string) ?? null;
      }
    }
    if (r.event_type === COMMUNITY_FEED_TYPES.listen) {
      const lid = payload.log_id as string | undefined;
      if (lid) base.log_id = lid;
    }

    return base;
  });
}

async function mergedItemsToV2(
  communityId: string,
  items: CommunityFeedMergedItem[],
): Promise<CommunityFeedItemV2[]> {
  if (!items.length) return [];

  const listenItems = items.filter(
    (i): i is Extract<CommunityFeedMergedItem, { kind: "listen" }> =>
      i.kind === "listen",
  );
  const trackIds = [
    ...new Set(
      listenItems
        .map((i) => i.metadata.track_id as string | undefined)
        .filter((x): x is string => Boolean(x?.trim())),
    ),
  ];

  const tracks =
    trackIds.length > 0 ? await getOrFetchTracksBatch(trackIds) : [];
  const trackMeta = new Map<
    string,
    {
      name: string;
      artists: { name: string }[];
      album?: { images?: { url: string }[] };
    }
  >();
  for (let i = 0; i < trackIds.length; i++) {
    const tid = trackIds[i];
    const t = tracks[i];
    if (t?.name) {
      trackMeta.set(tid, {
        name: t.name,
        artists: (t.artists as { name: string }[]) ?? [],
        album: t.album as { images?: { url: string }[] } | undefined,
      });
    }
  }

  const reviewMerged = items.filter(
    (i): i is Extract<CommunityFeedMergedItem, { kind: "review" }> =>
      i.kind === "review",
  );
  const nameKeyItems = reviewMerged.map((i) => ({
    entity_type:
      (i.metadata.entity_type as string) === "album"
        ? ("album" as const)
        : ("song" as const),
    entity_id: i.metadata.entity_id as string,
  }));
  const nameMap = await getEntityDisplayNames(nameKeyItems);

  const albumIds = [
    ...new Set(
      reviewMerged
        .filter((i) => i.metadata.entity_type === "album")
        .map((i) => i.metadata.entity_id as string),
    ),
  ];
  const songIds = [
    ...new Set(
      reviewMerged
        .filter((i) => i.metadata.entity_type === "song")
        .map((i) => i.metadata.entity_id as string),
    ),
  ];
  const [albumArr, songArr] = await Promise.all([
    albumIds.length ? getOrFetchAlbumsBatch(albumIds) : Promise.resolve([]),
    songIds.length ? getOrFetchTracksBatch(songIds) : Promise.resolve([]),
  ]);
  const albumArt = new Map(
    albumIds.map((id, i) => {
      const a = albumArr[i] as { images?: { url: string }[] } | undefined;
      return [id, a?.images?.[0]?.url ?? null] as [string, string | null];
    }),
  );
  const songArt = new Map(
    songIds.map((id, i) => {
      const t = songArr[i] as { album?: { images?: { url: string }[] } } | undefined;
      return [id, t?.album?.images?.[0]?.url ?? null] as [string, string | null];
    }),
  );

  const missingForName = new Set<string>();
  for (const i of reviewMerged) {
    const eid = i.metadata.entity_id as string;
    if (!nameMap.get(eid)?.trim()) missingForName.add(eid);
  }
  const fallbackName = new Map<string, string | null>();
  await Promise.all(
    [...missingForName].map(async (eid) => {
      const sample = reviewMerged.find((r) => r.metadata.entity_id === eid);
      const et = sample?.metadata.entity_type;
      if (et === "album") {
        const a = await getOrFetchAlbum(eid);
        fallbackName.set(eid, a.album?.name ?? null);
      } else {
        const t = await getOrFetchTrack(eid);
        fallbackName.set(eid, t?.name ?? null);
      }
    }),
  );

  const out: CommunityFeedItemV2[] = [];

  for (const item of items) {
    if (item.kind === "listen") {
      const tid = item.metadata.track_id as string | undefined;
      let trackName: string | null = null;
      let artistName: string | null = null;
      let artwork: string | null = null;
      if (tid) {
        const meta = trackMeta.get(tid);
        if (meta) {
          trackName = meta.name;
          artistName = meta.artists[0]?.name ?? null;
          artwork = meta.album?.images?.[0]?.url ?? null;
        }
      }
      const logId = item.id.startsWith("log:")
        ? item.id.slice(4)
        : item.id;
      const payload = {
        track_id: tid ?? null,
        title: item.metadata.title ?? null,
        log_type: item.metadata.log_type,
        log_id: logId,
      };
      const { label, sublabel } = buildLabel(
        COMMUNITY_FEED_TYPES.listen,
        payload,
        { trackName, artistName },
      );
      out.push({
        id: item.id,
        community_id: communityId,
        user_id: item.user_id,
        event_type: COMMUNITY_FEED_TYPES.listen,
        payload,
        created_at: item.created_at,
        username: item.username,
        avatar_url: item.avatar_url,
        label,
        sublabel,
        artwork_url: artwork,
        badge: badgeForType(COMMUNITY_FEED_TYPES.listen),
        log_id: logId,
      });
      continue;
    }

    if (item.kind === "review") {
      const eid = item.metadata.entity_id as string;
      const et =
        (item.metadata.entity_type as string) === "album" ? "album" : "song";
      const displayName =
        (nameMap.get(eid) ?? fallbackName.get(eid) ?? "").trim() || null;
      const rt = item.metadata.review_text as string | null | undefined;
      const snippet = rt?.trim() ? rt.trim().slice(0, 220) : null;
      const payload = {
        entity_type: et,
        entity_id: eid,
        entity_name: displayName,
        rating: item.metadata.rating as number,
        review_text: snippet,
        snippet,
      };
      const { label, sublabel } = buildLabel(
        COMMUNITY_FEED_TYPES.review,
        payload,
        {},
      );
      const reviewId = item.id.startsWith("review:")
        ? item.id.slice(7)
        : item.id;
      const artwork =
        et === "album" ? albumArt.get(eid) ?? null : songArt.get(eid) ?? null;
      out.push({
        id: item.id,
        community_id: communityId,
        user_id: item.user_id,
        event_type: COMMUNITY_FEED_TYPES.review,
        payload,
        created_at: item.created_at,
        username: item.username,
        avatar_url: item.avatar_url,
        label,
        sublabel,
        artwork_url: artwork,
        badge: badgeForType(COMMUNITY_FEED_TYPES.review),
        entity_type: et,
        entity_id: eid,
        entity_name: displayName,
        entity_href: et === "album" ? `/album/${eid}` : `/song/${eid}`,
        review_id: reviewId,
      });
      continue;
    }

    const mapped = mapCommunityEventToFeedPayload(
      item.type,
      item.metadata ?? {},
    );
    const payload = mapped.payload;
    const { label, sublabel } = buildLabel(mapped.eventType, payload, {});
    out.push({
      id: item.id,
      community_id: communityId,
      user_id: item.user_id,
      event_type: mapped.eventType,
      payload,
      created_at: item.created_at,
      username: item.username,
      avatar_url: item.avatar_url,
      label,
      sublabel,
      artwork_url: null,
      badge: badgeForType(mapped.eventType),
    });
  }

  return out;
}

/**
 * Community activity: reads **logs**, **reviews**, and **community_events** (merged), plus
 * supplemental **community_feed** rows that are not represented elsewhere (weekly roles,
 * follows, list updates). Same `CommunityFeedItemV2` shape as the table-only path.
 */
export async function getCommunityFeedUnified(
  communityId: string,
  limit = 50,
  filter: CommunityFeedFilterV2 = "all",
  offset = 0,
): Promise<CommunityFeedItemV2[]> {
  const cid = communityId?.trim();
  if (!cid) return [];

  const fetchLimit = Math.min(100, offset + limit + 25);
  const admin = createSupabaseAdminClient();

  const [merged, extraRaw] = await Promise.all([
    getCommunityFeedMerged(cid, fetchLimit, filter),
    fetchCommunityFeedExtras(cid, filter),
  ]);

  const mergedV2 = await mergedItemsToV2(cid, merged);
  const extraV2 = await enrichCommunityFeedTableRows(admin, extraRaw);
  const combined = [...mergedV2, ...extraV2];
  combined.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const sliced = combined.slice(offset, offset + limit);
  const targets: { targetType: "review" | "log"; targetId: string }[] = [];
  for (const item of sliced) {
    if (item.event_type === COMMUNITY_FEED_TYPES.review && item.review_id) {
      targets.push({ targetType: "review", targetId: item.review_id });
    } else if (item.event_type === COMMUNITY_FEED_TYPES.listen && item.log_id) {
      targets.push({ targetType: "log", targetId: item.log_id });
    }
  }
  const counts = await batchCountFeedActivityComments(cid, targets);
  return sliced.map((item) => {
    const key =
      item.event_type === COMMUNITY_FEED_TYPES.listen && item.log_id
        ? (`log:${item.log_id}` as const)
        : item.event_type === COMMUNITY_FEED_TYPES.review && item.review_id
          ? (`review:${item.review_id}` as const)
          : null;
    const n = key ? (counts.get(key) ?? 0) : 0;
    if (!key) return item;
    return { ...item, comment_count: n };
  });
}
