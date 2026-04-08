/**
 * When `logs_private` is on, passive listens are hidden from others’ views;
 * the account owner always sees their own data.
 */
export function viewerSeesUserLogs(
  viewerId: string | null | undefined,
  profileUserId: string,
  logsPrivate: boolean,
): boolean {
  if (!logsPrivate) return true;
  return Boolean(viewerId && viewerId === profileUserId);
}
