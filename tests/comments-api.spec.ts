import { test, expect } from "@playwright/test";

test.describe("Comments API", () => {
  test("GET /api/comments returns 200 and array for a valid review_id", async ({
    request,
  }) => {
    const lbRes = await request.get(
      "/api/leaderboard?type=popular&entity=song&metric=popular",
    );
    expect(lbRes.status()).toBe(200);
    const lb = await lbRes.json();
    expect(Array.isArray(lb.items)).toBe(true);

    if (lb.items.length === 0) test.skip(true, "no leaderboard data");

    let reviewId: string | undefined;
    const candidates = lb.items.slice(0, 5).map((x: any) => x.id).filter(Boolean);
    for (const songId of candidates) {
      const reviewsRes = await request.get(
        `/api/reviews?entity_type=song&entity_id=${encodeURIComponent(
          songId,
        )}&limit=5`,
      );
      expect(reviewsRes.status()).toBe(200);
      const reviews = await reviewsRes.json();
      if (reviews?.reviews?.[0]?.id) {
        reviewId = reviews.reviews[0].id;
        break;
      }
    }

    if (!reviewId) test.skip(true, "no reviews available for sample songs");

    const commentsRes = await request.get(
      `/api/comments?review_id=${encodeURIComponent(reviewId as string)}`,
    );
    expect(commentsRes.status()).toBe(200);
    const comments = await commentsRes.json();
    expect(Array.isArray(comments)).toBe(true);
  });
});

