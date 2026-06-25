import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./match", () => ({ matchAlbumOnDeezer: vi.fn() }));
vi.mock("@/lib/catalog/entity-resolution", () => ({
  linkAlbumExternalId: vi.fn(),
}));

import { matchAlbumOnDeezer } from "./match";
import { linkAlbumExternalId } from "@/lib/catalog/entity-resolution";
import { enrichAlbumDateFromDeezer } from "./enrich-album-date";

const mockedMatch = matchAlbumOnDeezer as unknown as ReturnType<typeof vi.fn>;
const mockedLink = linkAlbumExternalId as unknown as ReturnType<typeof vi.fn>;

/** Minimal Supabase stub: albums.select(release_date) → row, albums.update().eq() captured. */
function makeSupabase(existingReleaseDate: string | null) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "albums") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: { release_date: existingReleaseDate }, error: null }),
            }),
          }),
          update,
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return { supabase, update };
}

afterEach(() => vi.clearAllMocks());

describe("enrichAlbumDateFromDeezer", () => {
  it("writes release_date + total_tracks and links deezer id on a match", async () => {
    mockedMatch.mockResolvedValue({ deezerAlbumId: 302127, releaseDate: "2001-03-07", totalTracks: 14 });
    const { supabase, update } = makeSupabase(null);
    const result = await enrichAlbumDateFromDeezer(
      supabase as never,
      "album-uuid",
      "Daft Punk",
      "Discovery",
    );
    expect(result).toBe("written");
    expect(update).toHaveBeenCalledWith({ release_date: "2001-03-07", total_tracks: 14 });
    expect(mockedLink).toHaveBeenCalledWith(supabase, "album-uuid", "deezer", "302127");
  });

  it("writes only release_date when totalTracks is null", async () => {
    mockedMatch.mockResolvedValue({ deezerAlbumId: 302127, releaseDate: "2001-03-07", totalTracks: null });
    const { supabase, update } = makeSupabase(null);
    const result = await enrichAlbumDateFromDeezer(
      supabase as never,
      "album-uuid",
      "Daft Punk",
      "Discovery",
    );
    expect(result).toBe("written");
    expect(update).toHaveBeenCalledWith({ release_date: "2001-03-07" });
  });

  it("skips when the album already has a release_date", async () => {
    const { supabase, update } = makeSupabase("1999-01-01");
    const result = await enrichAlbumDateFromDeezer(
      supabase as never,
      "album-uuid",
      "Daft Punk",
      "Discovery",
    );
    expect(result).toBe("skipped-has-date");
    expect(update).not.toHaveBeenCalled();
    expect(mockedMatch).not.toHaveBeenCalled();
  });

  it("returns no-match when Deezer has nothing", async () => {
    mockedMatch.mockResolvedValue(null);
    const { supabase, update } = makeSupabase(null);
    const result = await enrichAlbumDateFromDeezer(
      supabase as never,
      "album-uuid",
      "Daft Punk",
      "Discovery",
    );
    expect(result).toBe("no-match");
    expect(update).not.toHaveBeenCalled();
  });
});
