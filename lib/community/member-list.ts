import type { CommunityMemberRole } from "@/lib/community/member-role";

export type CommunityMemberListRow = {
  user_id: string;
  username: string;
  avatar_url: string | null;
  role: CommunityMemberRole;
};
