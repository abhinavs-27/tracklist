import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  requireApiAuth: vi.fn().mockResolvedValue({ id: "user-1" }),
  handleUnauthorized: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/supabase-server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { lastfm_import_status: null, lastfm_import_progress: null },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));

describe("GET /api/lastfm/import-status", () => {
  it("returns null status when no import has been triggered", async () => {
    const { GET } = await import("@/app/api/lastfm/import-status/route");
    const req = new Request("http://localhost/api/lastfm/import-status");
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { status: string | null } };
    expect(body.data.status).toBeNull();
  });
});
