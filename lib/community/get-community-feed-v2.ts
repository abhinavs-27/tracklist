import "server-only";

/**
 * Community feed for API/UI: merged **logs + reviews + community_events**, plus
 * supplemental **community_feed** rows (weekly roles, follows, list updates).
 * @see getCommunityFeedUnified
 */
export type {
  CommunityFeedFilterV2,
  CommunityFeedItemV2,
} from "@/lib/community/community-feed-types";

export { getCommunityFeedUnified as getCommunityFeedV2 } from "@/lib/community/get-community-feed-unified";
