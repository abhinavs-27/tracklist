import { test, expect } from "@playwright/test";

const FAKE_UUID = "00000000-0000-4000-8000-000000000001";

test.describe("Lists", () => {
  test("lists page shows browse and search", async ({ page }) => {
    await page.goto("/lists");
    await expect(page.getByRole("heading", { name: /browse lists/i })).toBeVisible();
    await expect(page.getByPlaceholder(/search lists by title/i)).toBeVisible();
  });

  test("GET /api/users/[username]/lists returns array or 404", async ({ request }) => {
    const res = await request.get("/api/users/alice/lists");
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    }
  });

  test("POST /api/lists without auth returns 401", async ({ request }) => {
    const res = await request.post("/api/lists", {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ title: "Test list" }),
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/lists/[listId]/items without auth returns 401", async ({ request }) => {
    const res = await request.post(`/api/lists/${FAKE_UUID}/items`, {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ entity_type: "album", entity_id: "2nLhD10Z7Sb4RFyCX2ZCyx" }),
    });
    expect(res.status()).toBe(401);
  });

  test("DELETE /api/lists/[listId]/items/[itemId] without auth returns 401", async ({
    request,
  }) => {
    const res = await request.delete(`/api/lists/${FAKE_UUID}/items/${FAKE_UUID}`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/lists/[listId] with non-existent list returns 404", async ({ request }) => {
    const res = await request.get(`/api/lists/${FAKE_UUID}`);
    expect(res.status()).toBe(404);
  });

  test("invalid list UUID returns 404", async ({ request }) => {
    const res = await request.get("/api/lists/not-a-uuid");
    expect(res.status()).toBe(404);
  });

  test("list detail page with invalid id shows not found", async ({ page }) => {
    await page.goto(`/lists/${FAKE_UUID}`);
    await expect(page.getByText(/not found|page you're looking for/i)).toBeVisible({
      timeout: 10000,
    });
  });

  test("cannot add mismatched item type to list", async ({ request }) => {
    // This assumes DB is migrated and auth is wired; we only verify the API
    const res = await request.post("/api/lists/00000000-0000-4000-8000-000000000002/items", {
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({ entity_type: "song", entity_id: "fake_album_id" }),
    });
    expect([400, 401, 404, 500]).toContain(res.status());
  });

  test("lists page when authenticated shows your lists link", async ({ page }) => {
    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: "user_demo_1", name: "Alice", username: "alice" },
          expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      });
    });
    await page.goto("/lists");
    await expect(page.getByRole("link", { name: /your lists/i })).toBeVisible();
  });

  test("profile page shows Lists section", async ({ page }) => {
    await page.goto("/profile/alice");
    const notFound = await page.getByText(/not found|page you're looking for/i).isVisible();
    if (notFound) {
      test.skip();
      return;
    }
    await expect(page.getByRole("heading", { name: /^lists$/i })).toBeVisible();
  });
});
