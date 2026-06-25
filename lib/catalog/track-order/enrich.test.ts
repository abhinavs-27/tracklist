import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./resolve", () => ({ resolveAlbumTracklist: vi.fn() }));
import { resolveAlbumTracklist } from "./resolve";
import { enrichTrackOrderForAlbum } from "./enrich";

const mResolve = resolveAlbumTracklist as unknown as ReturnType<typeof vi.fn>;

function makeSupabase(opts: {
  albumRow: { name: string; artist_id: string; track_order_checked_at: string | null };
  artistName: string;
  trackRows: { id: string; name: string; track_number: number | null }[];
}) {
  const trackUpdates: Array<{ payload: unknown; id: unknown }> = [];
  const albumUpdates: unknown[] = [];
  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "albums") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: opts.albumRow, error: null }),
            }),
          }),
          update: vi.fn().mockImplementation((payload: unknown) => ({
            eq: vi.fn().mockImplementation((_c: string, _v: unknown) => {
              albumUpdates.push(payload);
              return Promise.resolve({ error: null });
            }),
          })),
        };
      }
      if (table === "artists") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { name: opts.artistName }, error: null }),
            }),
          }),
        };
      }
      if (table === "tracks") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: opts.trackRows, error: null }),
          }),
          update: vi.fn().mockImplementation((payload: unknown) => ({
            eq: vi.fn().mockImplementation((_c: string, v: unknown) => {
              trackUpdates.push({ payload, id: v });
              return Promise.resolve({ error: null });
            }),
          })),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };
  return { supabase, trackUpdates, albumUpdates };
}

afterEach(() => vi.clearAllMocks());

describe("enrichTrackOrderForAlbum", () => {
  it("writes track_number + disc_number for confident name matches, null-only", async () => {
    mResolve.mockResolvedValue({
      source: "deezer",
      tracks: [
        { title: "One More Time", trackNumber: 1, discNumber: 1 },
        { title: "Aerodynamic", trackNumber: 2, discNumber: 1 },
      ],
    });
    const { supabase, trackUpdates, albumUpdates } = makeSupabase({
      albumRow: { name: "Discovery", artist_id: "art-1", track_order_checked_at: null },
      artistName: "Daft Punk",
      trackRows: [
        { id: "t1", name: "One More Time", track_number: null },
        { id: "t2", name: "Aerodynamic", track_number: 5 },
      ],
    });
    const result = await enrichTrackOrderForAlbum(supabase as never, "alb-1");
    expect(result).toBe("written");
    expect(trackUpdates).toHaveLength(1);
    expect(trackUpdates[0]).toEqual({ payload: { track_number: 1, disc_number: 1 }, id: "t1" });
    expect(albumUpdates[0]).toEqual(expect.objectContaining({ track_order_checked_at: expect.any(String) }));
  });

  it("short-circuits with skipped-checked when already checked (no source call)", async () => {
    const { supabase, trackUpdates } = makeSupabase({
      albumRow: { name: "X", artist_id: "a", track_order_checked_at: "2026-01-01T00:00:00Z" },
      artistName: "Artist",
      trackRows: [],
    });
    const result = await enrichTrackOrderForAlbum(supabase as never, "alb-1");
    expect(result).toBe("skipped-checked");
    expect(mResolve).not.toHaveBeenCalled();
    expect(trackUpdates).toHaveLength(0);
  });

  it("returns no-source and stamps marker when no tracklist found", async () => {
    mResolve.mockResolvedValue(null);
    const { supabase, albumUpdates, trackUpdates } = makeSupabase({
      albumRow: { name: "X", artist_id: "a", track_order_checked_at: null },
      artistName: "Artist",
      trackRows: [{ id: "t1", name: "Song", track_number: null }],
    });
    const result = await enrichTrackOrderForAlbum(supabase as never, "alb-1");
    expect(result).toBe("no-source");
    expect(trackUpdates).toHaveLength(0);
    expect(albumUpdates[0]).toEqual(expect.objectContaining({ track_order_checked_at: expect.any(String) }));
  });

  it("does not assign the same source position to two tracks", async () => {
    mResolve.mockResolvedValue({ source: "deezer", tracks: [{ title: "Song", trackNumber: 1, discNumber: 1 }] });
    const { supabase, trackUpdates } = makeSupabase({
      albumRow: { name: "X", artist_id: "a", track_order_checked_at: null },
      artistName: "Artist",
      trackRows: [
        { id: "t1", name: "Song", track_number: null },
        { id: "t2", name: "Song", track_number: null },
      ],
    });
    const result = await enrichTrackOrderForAlbum(supabase as never, "alb-1");
    expect(result).toBe("written");
    expect(trackUpdates).toHaveLength(1);
  });
});
