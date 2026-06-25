import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("getLastfmTrackDuration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    process.env.LASTFM_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.LASTFM_API_KEY;
  });

  it("returns duration_ms from track.getInfo response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        track: { name: "Pyramid Song", duration: "284000" },
      }),
    }));

    const { getLastfmTrackDuration } = await import("@/lib/lastfm/get-track-duration");
    const ms = await getLastfmTrackDuration("Pyramid Song", "Radiohead");

    expect(ms).toBe(284000);
  });

  it("returns null when API key is missing", async () => {
    delete process.env.LASTFM_API_KEY;
    const { getLastfmTrackDuration } = await import("@/lib/lastfm/get-track-duration");
    const ms = await getLastfmTrackDuration("Some Track", "Some Artist");
    expect(ms).toBeNull();
  });

  it("returns null when duration field is absent", async () => {
    process.env.LASTFM_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ track: { name: "Unknown" } }),
    }));

    const { getLastfmTrackDuration } = await import("@/lib/lastfm/get-track-duration");
    const ms = await getLastfmTrackDuration("Unknown", "Artist");
    expect(ms).toBeNull();
  });

  it("returns null on Last.fm API error code", async () => {
    process.env.LASTFM_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 6, message: "Track not found" }),
    }));

    const { getLastfmTrackDuration } = await import("@/lib/lastfm/get-track-duration");
    const ms = await getLastfmTrackDuration("Ghost Track", "Nobody");
    expect(ms).toBeNull();
  });
});
