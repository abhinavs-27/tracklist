import type { CommunityMemberRole } from "@/lib/community/member-role";

/** Private: any member may change settings. Public: only admins. */
export function canEditCommunitySettings(
  isPrivate: boolean,
  isMember: boolean,
  role: CommunityMemberRole | null,
): boolean {
  if (!isMember || role === null) return false;
  if (isPrivate) return true;
  return role === "admin";
}

/** Private: any member may invite. Public: admins only. */
export function canInviteToCommunity(
  isPrivate: boolean,
  isMember: boolean,
  role: CommunityMemberRole | null,
): boolean {
  if (!isMember || role === null) return false;
  if (isPrivate) return true;
  return role === "admin";
}

/** Private: any member may promote. Public: admins only. */
export function canPromoteToAdmin(
  isPrivate: boolean,
  isMember: boolean,
  role: CommunityMemberRole | null,
): boolean {
  if (!isMember || role === null) return false;
  if (isPrivate) return true;
  return role === "admin";
}
