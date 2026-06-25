import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog/entity-resolution", () => ({ linkAlbumExternalId: vi.fn() }));
vi.mock("@/lib/deezer/match", () => ({ matchAlbumOnDeezer: vi.fn() }));
vi.mock("@/lib/deezer/client", () => ({ getDeezerAlbumTracks: vi.fn() }));
vi.mock("@/lib/musicbrainz/release-tracklist", () => ({ getMusicBrainzTracklist: vi.fn() }));

import { linkAlbumExternalId } from "@/lib/catalog/entity-resolution";
import { matchAlbumOnDeezer } from "@/lib/deezer/match";
import { getDeezerAlbumTracks } from "@/lib/deezer/client";
import { getMusicBrainzTracklist } from "@/lib/musicbrainz/release-tracklist";
import { resolveAlbumTracklist } from "./resolve";

const mLink = linkAlbumExternalId as unknown as ReturnType<typeof vi.fn>;
const mMatch = matchAlbumOnDeezer as unknown as ReturnType<typeof vi.fn>;
const mDzTracks = getDeezerAlbumTracks as unknown as ReturnType<typeof vi.fn>;
const mMbTracks = getMusicBrainzTracklist as unknown as ReturnType<typeof vi.fn>;

const album = { id: "alb-1", name: "Discovery", artistName: "Daft Punk", mbid: null as string | null };

/** Supabase stub for the album_external_ids (deezer) lookup. */
function makeSupa(deezerExternalId: string | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: deezerExternalId ? { external_id: deezerExternalId } : null,
            }),
          }),
        }),
      }),
    }),
  } as never;
}

afterEach(() => vi.clearAllMocks());

describe("resolveAlbumTracklist", () => {
  it("uses a stored Deezer id directly", async () => {
    mDzTracks.mockResolvedValue([{ title: "One More Time", trackNumber: 1, discNumber: 1 }]);
    const out = await resolveAlbumTracklist(makeSupa("302127"), album);
    expect(mDzTracks).toHaveBeenCalledWith(302127);
    expect(mMatch).not.toHaveBeenCalled();
    expect(out).toEqual({ source: "deezer", tracks: [{ title: "One More Time", trackNumber: 1, discNumber: 1 }] });
  });

  it("matches on Deezer when no stored id, then links the id", async () => {
    mLink.mockResolvedValue(undefined);
    mMatch.mockResolvedValue({ deezerAlbumId: 5, releaseDate: "2001-03-07", totalTracks: 14 });
    mDzTracks.mockResolvedValue([{ title: "A", trackNumber: 1, discNumber: 1 }]);
    const supa = makeSupa(null);
    const out = await resolveAlbumTracklist(supa, album);
    expect(mDzTracks).toHaveBeenCalledWith(5);
    expect(mLink).toHaveBeenCalledWith(supa, "alb-1", "deezer", "5");
    expect(out?.source).toBe("deezer");
  });

  it("falls back to MusicBrainz when Deezer fails and mbid is present", async () => {
    mMatch.mockResolvedValue(null);
    mMbTracks.mockResolvedValue([{ title: "M", trackNumber: 1, discNumber: 1 }]);
    const out = await resolveAlbumTracklist(makeSupa(null), { ...album, mbid: "rg-9" });
    expect(mMbTracks).toHaveBeenCalledWith("Daft Punk", "Discovery", "rg-9");
    expect(out).toEqual({ source: "musicbrainz", tracks: [{ title: "M", trackNumber: 1, discNumber: 1 }] });
  });

  it("returns null when Deezer fails and there is no mbid", async () => {
    mMatch.mockResolvedValue(null);
    const out = await resolveAlbumTracklist(makeSupa(null), album);
    expect(mMbTracks).not.toHaveBeenCalled();
    expect(out).toBeNull();
  });

  it("returns null when a Deezer id yields an empty tracklist and no mbid", async () => {
    mDzTracks.mockResolvedValue([]);
    const out = await resolveAlbumTracklist(makeSupa("7"), album);
    expect(out).toBeNull();
  });
});
