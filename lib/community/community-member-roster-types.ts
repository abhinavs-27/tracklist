import type { CommunityMemberRole } from "@/lib/community/member-role";

export type CommunityMemberRosterEntry = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  role: CommunityMemberRole;
  joined_at: string;
  /** Short line, e.g. "Indie, Rock · The National" */
  taste_summary: string | null;
  top_genres: string[];
  top_artists: string[];
  /** e.g. "32 listens · 12 artists this week" */
  activity_line: string | null;
  viewer_follows: boolean;
  is_community_creator: boolean;
  /** When this member appears in weekly taste-neighbor pairs vs you. */
  taste_neighbor?: {
    similarity_pct: number;
    kind: "similar" | "opposite";
  };
};
