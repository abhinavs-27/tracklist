import "server-only";

import { getActivityFeed } from "@/lib/queries";
import type { FeedActivity } from "@/types";

export async function getFeedForUser(
  userId: string,
  limit = 50,
): Promise<FeedActivity[]> {
  return getActivityFeed(userId, limit);
}
