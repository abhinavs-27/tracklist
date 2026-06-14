import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireApiAuth: vi.fn().mockResolvedValue({ id: "user-1", username: "test" }),
  handleUnauthorized: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { lastfm_username: "lfmuser", lastfm_import_status: "running" },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: vi.fn().mockReturnValue({
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  }),
}));

vi.mock("@/lib/jobs/lastfmQueue", () => ({
  enqueueLastfmFullImport: vi.fn().mockResolvedValue(undefined),
}));

describe("POST /api/lastfm/full-import", () => {
  it("returns 409 when import is already running", async () => {
    const { POST } = await import("@/app/api/lastfm/full-import/route");
    const req = new Request("http://localhost/api/lastfm/full-import", { method: "POST" });
    const res = await POST(req as any);
    expect(res.status).toBe(409);
  });
});
