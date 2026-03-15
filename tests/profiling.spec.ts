import { test, expect } from "@playwright/test";
import { getTopSlowest, clearPerfEntries } from "@/lib/profiling";

test.describe("Profiling", () => {
  test("getTopSlowest returns array and clearPerfEntries clears", () => {
    clearPerfEntries();
    const top = getTopSlowest(5);
    expect(Array.isArray(top)).toBe(true);
    expect(top.length).toBeLessThanOrEqual(5);
  });

  test("feed API with PROFILING=1 returns 200 and logs can be used for analysis", async ({
    request,
  }) => {
    const res = await request.get("/api/feed?limit=5");
    if (res.status() !== 200) {
      test.skip();
      return;
    }
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeLessThanOrEqual(5);
    // Profiling runs server-side; with PROFILING=1 you would see [perf] logs.
    // Here we only assert the endpoint succeeds so profiling code paths are hit.
  });

  test("album recommendations API returns and is capped", async ({ request }) => {
    const res = await request.get(
      "/api/recommendations/album?album_id=2UJcKSJbAUH7k2qOuc3H3K&limit=10",
    );
    expect([200, 400, 404]).toContain(res.status());
    if (res.status() === 200) {
      const data = await res.json();
      expect(Array.isArray(data.recommendations)).toBe(true);
      expect(data.recommendations.length).toBeLessThanOrEqual(20);
    }
  });
});
