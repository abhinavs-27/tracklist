import { test, expect } from "@playwright/test";

test.describe("Album API", () => {
  test("GET /api/albums/:id returns album, tracks, stats, reviews", async ({
    request,
  }) => {
    const lbRes = await request.get(
      "/api/leaderboard?type=popular&entity=album&metric=popular",
    );
    expect(lbRes.status()).toBe(200);
    const lb = await lbRes.json();
    expect(Array.isArray(lb.items)).toBe(true);

    if (lb.items.length === 0) test.skip(true, "no leaderboard data");

    const albumId: string = lb.items[0].id;
    const res = await request.get(`/api/albums/${albumId}`);
    expect(res.status()).toBe(200);

    const data = await res.json();
    expect(data.album.id).toBe(albumId);
    expect(typeof data.album.name).toBe("string");
    expect(typeof data.album.artist).toBe("string");
    expect(data.album.artwork_url === null || typeof data.album.artwork_url === "string").toBe(true);
    expect(data.album.release_date === null || typeof data.album.release_date === "string").toBe(true);

    expect(Array.isArray(data.tracks)).toBe(true);
    expect(Array.isArray(data.reviews?.items)).toBe(true);

    if (data.tracks.length > 0) {
      expect(typeof data.tracks[0].id).toBe("string");
      expect(typeof data.tracks[0].name).toBe("string");
      expect(typeof data.tracks[0].track_number).toBe("number");
      expect(data.tracks[0].duration_ms === null || typeof data.tracks[0].duration_ms === "number").toBe(true);
      expect(typeof data.tracks[0].listen_count).toBe("number");
      expect(typeof data.tracks[0].review_count).toBe("number");
      expect(
        data.tracks[0].average_rating === null ||
          typeof data.tracks[0].average_rating === "number",
      ).toBe(true);
    }

    expect(typeof data.stats.play_count).toBe("number");
    expect(typeof data.stats.review_count).toBe("number");
    expect(typeof data.stats.favorite_count).toBe("number");
    expect(data.stats.average_rating === null || typeof data.stats.average_rating === "number").toBe(true);
  });
});

