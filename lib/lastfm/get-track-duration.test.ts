import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchLastfmApi } from "@/lib/lastfm/lastfm-api-fetch";
import { throttleLastfm } from "@/lib/lastfm/throttle";
import { getLastfmTrackDuration } from "@/lib/lastfm/get-track-duration";

vi.mock("@/lib/lastfm/lastfm-api-fetch");
vi.mock("@/lib/lastfm/throttle");

const mockFetchLastfmApi = vi.mocked(fetchLastfmApi);
const mockThrottleLastfm = vi.mocked(throttleLastfm);

describe("getLastfmTrackDuration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockThrottleLastfm.mockResolvedValue(undefined);
    process.env.LASTFM_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.LASTFM_API_KEY;
  });

  it("returns duration_ms from track.getInfo response", async () => {
    mockFetchLastfmApi.mockResolvedValue({
      ok: true,
      json: async () => ({ track: { name: "Pyramid Song", duration: "284000" } }),
    } as Response);

    const ms = await getLastfmTrackDuration("Pyramid Song", "Radiohead");
    expect(ms).toBe(284000);
  });

  it("returns null when API key is missing", async () => {
    delete process.env.LASTFM_API_KEY;
    const ms = await getLastfmTrackDuration("Some Track", "Some Artist");
    expect(ms).toBeNull();
    expect(mockFetchLastfmApi).not.toHaveBeenCalled();
  });

  it("returns null when duration field is absent", async () => {
    mockFetchLastfmApi.mockResolvedValue({
      ok: true,
      json: async () => ({ track: { name: "Unknown" } }),
    } as Response);

    const ms = await getLastfmTrackDuration("Unknown", "Artist");
    expect(ms).toBeNull();
  });

  it("returns null on Last.fm API error code", async () => {
    mockFetchLastfmApi.mockResolvedValue({
      ok: true,
      json: async () => ({ error: 6, message: "Track not found" }),
    } as Response);

    const ms = await getLastfmTrackDuration("Ghost Track", "Nobody");
    expect(ms).toBeNull();
  });

  it("returns null when duration is zero", async () => {
    mockFetchLastfmApi.mockResolvedValue({
      ok: true,
      json: async () => ({ track: { name: "Silent", duration: "0" } }),
    } as Response);

    const ms = await getLastfmTrackDuration("Silent", "Artist");
    expect(ms).toBeNull();
  });

  it("returns null on fetch error", async () => {
    mockFetchLastfmApi.mockRejectedValue(new Error("Network failure"));
    const ms = await getLastfmTrackDuration("Track", "Artist");
    expect(ms).toBeNull();
  });
});
