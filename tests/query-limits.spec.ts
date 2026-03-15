import { test, expect } from "@playwright/test";

test.describe("Query limits and performance caps", () => {
  test("reviews API returns at most 30 items when limit param is higher", async ({
    request,
  }) => {
    const res = await request.get(
      "/api/reviews?entity_type=album&entity_id=2UJcKSJbAUH7k2qOuc3H3K&limit=50",
    );
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.reviews)).toBe(true);
    expect(data.reviews.length).toBeLessThanOrEqual(30);
  });
});
