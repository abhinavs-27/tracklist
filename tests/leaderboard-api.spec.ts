import { test, expect } from "@playwright/test";

test.describe("Leaderboard API", () => {
  test("GET /api/leaderboard returns 200 and album items shape", async ({
    request,
  }) => {
    const res = await request.get(
      "/api/leaderboard?type=popular&entity=album&metric=popular",
    );
    expect(res.status()).toBe(200);
    const data = await res.json();

    expect(Array.isArray(data.items)).toBe(true);
    expect(data.nextCursor === null || typeof data.nextCursor === "number").toBe(true);

    if (data.items.length === 0) test.skip(true, "no leaderboard data");

    expect(data.items[0]).toMatchObject({
      entity_type: "album",
      id: expect.any(String),
      name: expect.any(String),
      artist: expect.any(String),
      artwork_url: expect.any(String),
      total_plays: expect.any(Number),
    });
    expect(
      data.items[0].average_rating === null ||
        typeof data.items[0].average_rating === "number",
    ).toBe(true);
  });

  test("GET /api/leaderboard returns 200 and song items shape", async ({
    request,
  }) => {
    const res = await request.get(
      "/api/leaderboard?type=popular&entity=song&metric=popular",
    );
    expect(res.status()).toBe(200);
    const data = await res.json();

    expect(Array.isArray(data.items)).toBe(true);
    expect(data.nextCursor === null || typeof data.nextCursor === "number").toBe(true);

    if (data.items.length === 0) test.skip(true, "no leaderboard data");

    expect(data.items[0]).toMatchObject({
      entity_type: "song",
      id: expect.any(String),
      name: expect.any(String),
      artist: expect.any(String),
      artwork_url: expect.any(String),
      total_plays: expect.any(Number),
    });
    expect(
      data.items[0].average_rating === null ||
        typeof data.items[0].average_rating === "number",
    ).toBe(true);
  });
});

