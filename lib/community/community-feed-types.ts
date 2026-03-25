/** Shared types for `community_feed` API and UI (no server-only). */

export type CommunityFeedFilterV2 =
  | "all"
  | "listens"
  | "reviews"
  | "streaks"
  | "members";

export type CommunityFeedItemV2 = {
  id: string;
  community_id: string;
  user_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  username: string;
  avatar_url: string | null;
  /** Pre-rendered primary line */
  label: string;
  /** Subline (entity name, snippet, etc.) */
  sublabel: string | null;
  artwork_url: string | null;
  badge:
    | "streak"
    | "review"
    | "list"
    | "listen"
    | "member"
    | "follow"
    | null;
  /** Album/song link target for reviews */
  entity_type?: "album" | "song" | null;
  entity_id?: string | null;
  entity_name?: string | null;
  entity_href?: string | null;
  /** Bare review row id (for community comments + links) */
  review_id?: string | null;
  /** Log id for listen rows (community comments on listens) */
  log_id?: string | null;
  /** Thread size for activity comments (community or global log) */
  comment_count?: number;
};
