/**
 * Intent-based primary nav: Home, Explore, Community, You.
 * Used by TopNav / BottomNav for active states (client-safe).
 */

export type PrimaryTab = "home" | "explore" | "community" | "you";

/** Shared labels + hrefs for Home / Explore / Community / You (desktop, mobile top strip, bottom bar). */
export const PRIMARY_NAV_LINKS: { id: PrimaryTab; label: string; href: string }[] =
  [
    { id: "home", label: "Home", href: "/" },
    { id: "explore", label: "Explore", href: "/explore" },
    { id: "community", label: "Community", href: "/communities" },
    { id: "you", label: "You", href: "/you" },
  ];

export function getActiveTab(
  pathname: string,
  userId: string | null | undefined,
): PrimaryTab | null {
  if (pathname === "/onboarding" || pathname.startsWith("/auth")) {
    return null;
  }

  if (pathname === "/" || pathname === "/feed") {
    return "home";
  }

  if (
    pathname === "/explore" ||
    pathname.startsWith("/discover") ||
    pathname.startsWith("/leaderboard") ||
    pathname.startsWith("/search/users")
  ) {
    return "explore";
  }

  if (pathname.startsWith("/communities") || pathname.startsWith("/community/")) {
    return "community";
  }

  if (
    pathname === "/you" ||
    pathname.startsWith("/lists") ||
    pathname.startsWith("/reports")
  ) {
    return "you";
  }

  if (userId && pathname === `/profile/${userId}`) {
    return "you";
  }

  return null;
}
