import "server-only";

import { getReviewFeed } from "@/lib/queries";
import type { ReviewWithUser } from "@/types";

export async function getFeedForUser(
  userId: string,
  limit = 50,
): Promise<ReviewWithUser[]> {
  return getReviewFeed(userId, limit);
}
