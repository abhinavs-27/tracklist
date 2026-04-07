/**
 * Client-safe: turn stored avatar URLs into same-origin proxy paths when they refer to
 * our private S3 profile objects, so <img src> works without public bucket access.
 * Also passes through blob: URLs (optimistic preview) and non-S3 URLs (e.g. OAuth avatars).
 */

export function resolveUserAvatarUrl(
  userId: string,
  avatarUrl: string | null,
): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("blob:")) return avatarUrl;
  if (avatarUrl.startsWith("/api/profile-pictures/user/")) return avatarUrl;
  if (avatarUrl.includes("/api/profile-pictures/user/")) return avatarUrl;
  const marker = `/profile_pictures/users/${userId}.jpg`;
  if (avatarUrl.includes(marker)) {
    return `/api/profile-pictures/user/${userId}`;
  }
  return avatarUrl;
}

export function resolveCommunityAvatarUrl(
  communityId: string,
  avatarUrl: string | null,
): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith("/api/profile-pictures/community/")) return avatarUrl;
  if (avatarUrl.includes("/api/profile-pictures/community/")) return avatarUrl;
  const marker = `/profile_pictures/communities/${communityId}.jpg`;
  if (avatarUrl.includes(marker)) {
    return `/api/profile-pictures/community/${communityId}`;
  }
  return avatarUrl;
}
