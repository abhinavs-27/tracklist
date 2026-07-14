import { describe, it, expect, vi } from "vitest";
import { resolveReviewEntityId } from "./resolve-review-entity-id";

const isUuid = (s: string) => /^[0-9a-f]{8}-/.test(s);
const isSpotifyId = (s: string) => /^[A-Za-z0-9]{22}$/.test(s);

describe("resolveReviewEntityId", () => {
  it("passes a UUID through untouched without calling any resolver", async () => {
    const resolveOffline = vi.fn();
    const resolveWithNetwork = vi.fn();
    const out = await resolveReviewEntityId("11111111-1111-1111-1111-111111111111", {
      isUuid,
      isSpotifyId,
      resolveOffline,
      resolveWithNetwork,
    });
    expect(out).toEqual({ kind: "resolved", id: "11111111-1111-1111-1111-111111111111" });
    expect(resolveOffline).not.toHaveBeenCalled();
    expect(resolveWithNetwork).not.toHaveBeenCalled();
  });

  it("resolves a Spotify ID from the catalog OFFLINE and never hits the network (the fix)", async () => {
    const spotifyId = "4aawyAB9vmqN3uQ7FjRGTy";
    const resolveOffline = vi.fn(async () => "canonical-uuid-1");
    const resolveWithNetwork = vi.fn(async () => {
      throw new Error("network must not be called when the entity is in the catalog");
    });
    const out = await resolveReviewEntityId(spotifyId, {
      isUuid,
      isSpotifyId,
      resolveOffline,
      resolveWithNetwork,
    });
    expect(out).toEqual({ kind: "resolved", id: "canonical-uuid-1" });
    expect(resolveWithNetwork).not.toHaveBeenCalled();
  });

  it("falls back to the network only when the Spotify ID is absent from the catalog", async () => {
    const spotifyId = "4aawyAB9vmqN3uQ7FjRGTy";
    const out = await resolveReviewEntityId(spotifyId, {
      isUuid,
      isSpotifyId,
      resolveOffline: async () => null,
      resolveWithNetwork: async () => "networked-uuid-2",
    });
    expect(out).toEqual({ kind: "resolved", id: "networked-uuid-2" });
  });

  it("returns 'pending' instead of hard-failing when both offline and network resolution fail", async () => {
    const spotifyId = "4aawyAB9vmqN3uQ7FjRGTy";
    const out = await resolveReviewEntityId(spotifyId, {
      isUuid,
      isSpotifyId,
      resolveOffline: async () => null,
      resolveWithNetwork: async () => {
        throw new Error("Spotify unavailable");
      },
    });
    expect(out).toEqual({ kind: "pending" });
  });

  it("passes a non-UUID, non-Spotify id (e.g. lfm:) through untouched", async () => {
    const resolveOffline = vi.fn();
    const out = await resolveReviewEntityId("lfm:abcdef", {
      isUuid,
      isSpotifyId,
      resolveOffline,
      resolveWithNetwork: vi.fn(),
    });
    expect(out).toEqual({ kind: "resolved", id: "lfm:abcdef" });
    expect(resolveOffline).not.toHaveBeenCalled();
  });
});
