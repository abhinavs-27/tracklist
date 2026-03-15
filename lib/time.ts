/**
 * Format a date as a relative time string (e.g. "2m ago", "Yesterday").
 * Use for feed items, reviews, logs, friend activity.
 */
export function formatRelativeTime(date: Date | string): string {
  const ts = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  const sec = (Date.now() - ts) / 1000;
  if (sec < 0) return "just now";
  if (sec < 60) return "just now";
  if (sec < 120) return "1m ago";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 7200) return "1h ago";
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 172800) return "Yesterday";
  if (sec < 604800) return `${Math.floor(sec / 86400)} days ago`;
  if (sec < 1209600) return "1 week ago";
  if (sec < 2592000) return `${Math.floor(sec / 604800)} weeks ago`;
  return new Date(ts).toLocaleDateString();
}
