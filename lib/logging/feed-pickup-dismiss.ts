const KEY = "tracklist:feed_pickup_strip_dismissed_v1";

export function isFeedPickupStripDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissFeedPickupStrip(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    /* ignore quota */
  }
}
