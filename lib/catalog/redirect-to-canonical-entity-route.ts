import "server-only";

import { redirect } from "next/navigation";

type EntityRoute = "album" | "song" | "artist";

/**
 * After catalog ensure (`getOrFetch*`), if we have a canonical UUID that differs from the
 * route param (e.g. search links use Spotify ids), normalize the URL for bookmarks and
 * downstream code that expects a single id shape.
 */
export function redirectToCanonicalEntityIfNeeded(
  kind: EntityRoute,
  routeParam: string,
  canonicalId: string | null,
): void {
  if (!canonicalId || canonicalId === routeParam) return;
  redirect(`/${kind}/${encodeURIComponent(canonicalId)}`);
}
