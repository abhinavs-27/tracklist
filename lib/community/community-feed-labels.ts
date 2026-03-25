import type { CommunityFeedItemV2 } from "@/lib/community/community-feed-types";
import { COMMUNITY_FEED_TYPES } from "@/lib/community/community-feed-insert";

export function badgeForType(t: string): CommunityFeedItemV2["badge"] {
  switch (t) {
    case COMMUNITY_FEED_TYPES.listen:
      return "listen";
    case COMMUNITY_FEED_TYPES.review:
      return "review";
    case COMMUNITY_FEED_TYPES.list_update:
      return "list";
    case COMMUNITY_FEED_TYPES.streak_role:
      return "streak";
    case COMMUNITY_FEED_TYPES.member_joined:
      return "member";
    case COMMUNITY_FEED_TYPES.follow_in_community:
      return "follow";
    default:
      return null;
  }
}

export function buildLabel(
  eventType: string,
  payload: Record<string, unknown>,
  extras: {
    trackName?: string | null;
    artistName?: string | null;
    targetUsername?: string | null;
  },
): { label: string; sublabel: string | null } {
  switch (eventType) {
    case COMMUNITY_FEED_TYPES.listen: {
      const title =
        extras.trackName ||
        (payload.title as string) ||
        "a track";
      const artist = extras.artistName || "Unknown artist";
      return {
        label: `Listened to ${title}`,
        sublabel: artist,
      };
    }
    case COMMUNITY_FEED_TYPES.review: {
      const et = (payload.entity_type as string) || "album";
      const r = Number(payload.rating) || 0;
      const entityName = (payload.entity_name as string | undefined)?.trim();
      const label = entityName
        ? `Rated ${entityName} ${r}/5`
        : `Rated a ${et} ${r}/5`;
      const sub =
        (payload.snippet as string)?.trim() ||
        (payload.review_text as string)?.trim() ||
        null;
      return {
        label,
        sublabel: sub ? sub.slice(0, 220) : null,
      };
    }
    case COMMUNITY_FEED_TYPES.list_update: {
      const action =
        (payload.action as string) === "remove" ? "Removed from" : "Added to";
      const lt = (payload.list_title as string) || "a list";
      return {
        label: `${action} ${lt}`,
        sublabel: null,
      };
    }
    case COMMUNITY_FEED_TYPES.streak_role: {
      const label =
        (payload.label as string) || (payload.role_type as string) || "Milestone";
      return {
        label: String(label),
        sublabel: (payload.milestone as string) || null,
      };
    }
    case COMMUNITY_FEED_TYPES.member_joined:
      return {
        label: "Joined the community",
        sublabel: null,
      };
    case COMMUNITY_FEED_TYPES.follow_in_community:
      return {
        label: extras.targetUsername
          ? `Started following ${extras.targetUsername}`
          : "Started following a member",
        sublabel: null,
      };
    default:
      return {
        label: eventType.replace(/_/g, " "),
        sublabel: null,
      };
  }
}
