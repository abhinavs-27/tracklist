import "server-only";

import { getAppBaseUrl } from "@/lib/app-url";

/** Same-origin path; browser resolves against current origin if stored relatively (not recommended). */
export function profilePictureProxyPath(
  type: "user" | "community",
  id: string,
): string {
  return type === "user"
    ? `/api/profile-pictures/user/${id}`
    : `/api/profile-pictures/community/${id}`;
}

/**
 * Canonical `avatar_url` we persist after upload: stable HTTPS URL on this app that
 * 302-redirects to a presigned S3 GET (private bucket, no public objects).
 */
export function profilePictureProxyUrlAbsolute(
  type: "user" | "community",
  id: string,
): string {
  return `${getAppBaseUrl()}${profilePictureProxyPath(type, id)}`;
}
