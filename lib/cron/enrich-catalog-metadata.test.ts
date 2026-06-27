import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/deezer/enrich-album-date", () => ({ enrichAlbumDateFromDeezer: vi.fn() }));
vi.mock("@/lib/catalog/track-order/enrich", () => ({ enrichTrackOrderForAlbum: vi.fn() }));

import { enrichAlbumDateFromDeezer } from "@/lib/deezer/enrich-album-date";
import { enrichTrackOrderForAlbum } from "@/lib/catalog/track-order/enrich";
import { runDateEnrichmentBatch, runTrackOrderEnrichmentBatch } from "./enrich-catalog-metadata";

const mDate = enrichAlbumDateFromDeezer as unknown as ReturnType<typeof vi.fn>;
const mTrack = enrichTrackOrderForAlbum as unknown as ReturnType<typeof vi.fn>;

/** Supabase stub whose .rpc(name, args) returns a preset list. */
function makeSupabase(rpcData: Record<string, unknown[]>) {
  return {
    rpc: vi.fn().mockImplementation((name: string) =>
      Promise.resolve({ data: rpcData[name] ?? [], error: null }),
    ),
  } as never;
}

afterEach(() => vi.clearAllMocks());

describe("runDateEnrichmentBatch", () => {
  it("calls the date writer per selected album and tallies", async () => {
    const supabase = makeSupabase({
      catalog_albums_needing_date: [
        { album_id: "a1", album_name: "Disc", artist_name: "DP" },
        { album_id: "a2", album_name: "RAM", artist_name: "DP" },
      ],
    });
    mDate.mockResolvedValueOnce("written").mockResolvedValueOnce("no-match");
    const res = await runDateEnrichmentBatch(supabase, 50);
    expect((supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      "catalog_albums_needing_date", { p_limit: 50 });
    expect(mDate).toHaveBeenNthCalledWith(1, supabase, "a1", "DP", "Disc");
    expect(res).toEqual({ processed: 2, written: 1, noMatch: 1, errored: 0 });
  });
});

describe("runTrackOrderEnrichmentBatch", () => {
  it("calls the track writer with force per selected album and tallies", async () => {
    const supabase = makeSupabase({
      catalog_albums_needing_track_order: [{ album_id: "a1" }, { album_id: "a2" }, { album_id: "a3" }],
    });
    mTrack
      .mockResolvedValueOnce("written")
      .mockResolvedValueOnce("no-source")
      .mockResolvedValueOnce("no-match");
    const res = await runTrackOrderEnrichmentBatch(supabase, 25);
    expect((supabase as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      "catalog_albums_needing_track_order", { p_limit: 25 });
    expect(mTrack).toHaveBeenNthCalledWith(1, supabase, "a1", { force: true, deezerOnly: true });
    expect(res).toEqual({ processed: 3, written: 1, noSource: 1, noMatch: 1, errored: 0 });
  });
});
