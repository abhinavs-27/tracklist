import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./match-album-date", () => ({ matchAlbumDateOnMusicBrainz: vi.fn() }));
import { matchAlbumDateOnMusicBrainz } from "./match-album-date";
import { enrichAlbumDateFromMusicBrainz } from "./enrich-album-date";

const mockedMatch = matchAlbumDateOnMusicBrainz as unknown as ReturnType<typeof vi.fn>;

function makeSupabase(existingReleaseDate: string | null) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "albums") {
        return {
          select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { release_date: existingReleaseDate }, error: null }) }) }),
          update,
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return { supabase, update };
}
afterEach(() => vi.clearAllMocks());

describe("enrichAlbumDateFromMusicBrainz", () => {
  it("writes release_date + mbid on a match", async () => {
    mockedMatch.mockResolvedValue({ mbid: "mbid-1", releaseDate: "2001-03-07" });
    const { supabase, update } = makeSupabase(null);
    const result = await enrichAlbumDateFromMusicBrainz(supabase as never, "album-uuid", "Daft Punk", "Discovery");
    expect(result).toBe("written");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ release_date: "2001-03-07", mbid: "mbid-1" }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ mb_date_checked_at: expect.any(String) }));
  });

  it("skips when the album already has a release_date", async () => {
    const { supabase, update } = makeSupabase("1999-01-01");
    const result = await enrichAlbumDateFromMusicBrainz(supabase as never, "album-uuid", "Daft Punk", "Discovery");
    expect(result).toBe("skipped-has-date");
    expect(update).not.toHaveBeenCalled();
    expect(mockedMatch).not.toHaveBeenCalled();
  });

  it("returns no-match when MusicBrainz has nothing", async () => {
    mockedMatch.mockResolvedValue(null);
    const { supabase, update } = makeSupabase(null);
    const result = await enrichAlbumDateFromMusicBrainz(supabase as never, "album-uuid", "Daft Punk", "Discovery");
    expect(result).toBe("no-match");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ mb_date_checked_at: expect.any(String) }));
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ release_date: expect.anything() }));
  });
});
