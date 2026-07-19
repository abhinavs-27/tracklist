import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

let prefRow: Record<string, boolean> | null = null;
const upserts: unknown[] = [];

vi.mock("@/lib/auth", () => ({
  requireApiAuth: async () => ({ id: "u1" }),
  handleUnauthorized: () => null,
}));
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: prefRow, error: null }) }),
      }),
      upsert: async (row: unknown) => {
        upserts.push(row);
        return { error: null };
      },
    }),
  }),
}));

beforeEach(() => {
  prefRow = null;
  upserts.length = 0;
});

import { GET, PATCH } from "./route";

function req(body?: unknown) {
  return {
    json: async () => body,
  } as never;
}

describe("notification-preferences", () => {
  it("returns defaults when no row exists", async () => {
    const res = await GET(req());
    const body = await res.json();
    expect(body).toMatchObject({
      social: true,
      recommendations: true,
      community: true,
      charts: false,
    });
  });

  it("upserts a partial patch", async () => {
    const res = await PATCH(req({ charts: true }));
    expect(res.status).toBe(200);
    expect(upserts[0]).toMatchObject({ user_id: "u1", charts: true });
  });
});
