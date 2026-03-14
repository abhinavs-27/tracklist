import "server-only";

import { getActivityFeed } from "@/lib/queries";
import type { ActivityFeedPage } from "@/lib/queries";

export async function getFeedForUser(
  userId: string,
  limit = 50,
  cursor: string | null = null,
): Promise<ActivityFeedPage> {
  return getActivityFeed(userId, limit, cursor);
}
