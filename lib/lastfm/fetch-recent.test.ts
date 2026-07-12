import { describe, it, expect, vi, beforeEach } from "vitest";

const fetchLastfmApi = vi.fn();

vi.mock("@/lib/lastfm/lastfm-api-fetch", () => ({
  fetchLastfmApi: (...args: unknown[]) => fetchLastfmApi(...args),
}));

function lastfmErrorResponse(status: number, error: number, message: string) {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(JSON.stringify({ error, message })),
  };
}

describe("fetchLastfmRecentTracksSafe", () => {
  beforeEach(() => {
    fetchLastfmApi.mockReset();
    process.env.LASTFM_API_KEY = "test-key";
  });

  it("classifies HTTP 404 {error:6} as invalid_user without retrying", async () => {
    fetchLastfmApi.mockResolvedValue(lastfmErrorResponse(404, 6, "User not found"));

    const { fetchLastfmRecentTracksSafe } = await import("@/lib/lastfm/fetch-recent");
    const result = await fetchLastfmRecentTracksSafe("no_such_user", 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_user");
    }
    expect(fetchLastfmApi).toHaveBeenCalledTimes(1);
  });

  it("classifies HTTP 403 {error:10} as invalid_api_key without retrying", async () => {
    fetchLastfmApi.mockResolvedValue(lastfmErrorResponse(403, 10, "Invalid API key"));

    const { fetchLastfmRecentTracksSafe } = await import("@/lib/lastfm/fetch-recent");
    const result = await fetchLastfmRecentTracksSafe("someone", 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_api_key");
    }
    expect(fetchLastfmApi).toHaveBeenCalledTimes(1);
  });

  it("still retries non-Last.fm HTTP failures", async () => {
    fetchLastfmApi.mockResolvedValue({
      ok: false,
      status: 502,
      text: () => Promise.resolve("Bad Gateway"),
    });

    const { fetchLastfmRecentTracksSafe } = await import("@/lib/lastfm/fetch-recent");
    const result = await fetchLastfmRecentTracksSafe("someone", 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("fetch_failed");
    }
    expect(fetchLastfmApi).toHaveBeenCalledTimes(3);
  });
});

describe("fetchLastfmRecentTracksPageSafe", () => {
  beforeEach(() => {
    fetchLastfmApi.mockReset();
    process.env.LASTFM_API_KEY = "test-key";
  });

  it("classifies HTTP 404 {error:6} as invalid_user without retrying", async () => {
    fetchLastfmApi.mockResolvedValue(lastfmErrorResponse(404, 6, "User not found"));

    const { fetchLastfmRecentTracksPageSafe } = await import("@/lib/lastfm/fetch-recent");
    const result = await fetchLastfmRecentTracksPageSafe("no_such_user", 200, 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe("invalid_user");
    }
    expect(fetchLastfmApi).toHaveBeenCalledTimes(1);
  });
});
