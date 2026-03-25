import { COMMUNITY_FEED_TYPES } from "@/lib/community/community-feed-insert";
import type { CommunityEventType } from "@/types";

/**
 * Maps legacy `community_events` rows to `community_feed`-style event_type + payload.
 * Used when reading merged activity and when mirroring into `community_feed` on write.
 */
export function mapCommunityEventToFeedPayload(
  type: CommunityEventType,
  metadata: Record<string, unknown>,
): { eventType: string; payload: Record<string, unknown> } {
  const meta = metadata ?? {};
  switch (type) {
    case "streak": {
      const days = Number(meta.days) || 0;
      return {
        eventType: COMMUNITY_FEED_TYPES.streak_role,
        payload: {
          kind: "streak",
          days,
          label: `${days}-day listening streak`,
          milestone: "Profile streak",
        },
      };
    }
    case "top_artist": {
      const name = (meta.artist_name as string) || "an artist";
      return {
        eventType: COMMUNITY_FEED_TYPES.streak_role,
        payload: {
          kind: "top_artist",
          artist_name: name,
          label: `Into ${name} lately`,
        },
      };
    }
    case "milestone": {
      const kind = meta.kind as string | undefined;
      if (kind === "joined" || kind === "created") {
        return {
          eventType: COMMUNITY_FEED_TYPES.member_joined,
          payload: { kind },
        };
      }
      return {
        eventType: COMMUNITY_FEED_TYPES.streak_role,
        payload: { kind: kind ?? "milestone", ...meta },
      };
    }
    case "role_badge": {
      return {
        eventType: COMMUNITY_FEED_TYPES.streak_role,
        payload: {
          kind: "role_badge",
          role: meta.role,
          label: meta.role ? String(meta.role) : "Community badge",
        },
      };
    }
    case "listen":
    case "review":
      return {
        eventType:
          type === "listen"
            ? COMMUNITY_FEED_TYPES.listen
            : COMMUNITY_FEED_TYPES.review,
        payload: { ...meta },
      };
    default:
      return {
        eventType: COMMUNITY_FEED_TYPES.streak_role,
        payload: { legacy_type: type, ...meta },
      };
  }
}
