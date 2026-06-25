import { afterEach, describe, expect, it, vi } from "vitest";

const albumIdForTrack = "album-uuid-1";

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "tracks") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { album_id: albumIdForTrack }, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    }),
  }),
}));
vi.mock("@/lib/catalog/entity-resolution", () => ({
  getTrackIdByExternalId: vi.fn().mockResolvedValue("lfm-track-uuid"),
  getArtistIdByExternalId: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/deezer/enrich-album-date", () => ({ enrichAlbumDateFromDeezer: vi.fn().mockResolvedValue("written") }));
vi.mock("@/lib/lastfm/map-to-spotify", () => ({ mapLastfmToSpotify: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/lastfm/lfm-ids", () => ({ lfmArtistId: () => "lfm:artist" }));
vi.mock("@/lib/catalog/merge-canonical", () => ({ mergeCanonicalArtists: vi.fn(), mergeCanonicalTracks: vi.fn() }));
vi.mock("@/lib/spotify", () => ({ getTrack: vi.fn(), searchSpotify: vi.fn() }));
vi.mock("@/lib/spotify/matching", () => ({ pickBestArtistMatch: vi.fn() }));
vi.mock("@/lib/spotify-cache", () => ({
  firstSpotifyImageUrl: vi.fn(),
  upsertArtistFromSpotify: vi.fn(),
  upsertTrackFromSpotify: vi.fn(),
}));

import { resolveTrackSpotifyJob } from "./resolve-spotify-enrichment";
import { enrichAlbumDateFromDeezer } from "@/lib/deezer/enrich-album-date";

const mockedEnrich = enrichAlbumDateFromDeezer as unknown as ReturnType<typeof vi.fn>;

afterEach(() => vi.clearAllMocks());

describe("resolveTrackSpotifyJob — Deezer hook", () => {
  it("enriches the track's album via Deezer using the album name", async () => {
    await resolveTrackSpotifyJob({
      lfmSongId: "lfm:song",
      artistName: "Daft Punk",
      trackName: "One More Time",
      albumName: "Discovery",
    });
    expect(mockedEnrich).toHaveBeenCalledWith(
      expect.anything(),
      albumIdForTrack,
      "Daft Punk",
      "Discovery",
    );
  });

  it("does not call Deezer when the scrobble has no album name", async () => {
    await resolveTrackSpotifyJob({
      lfmSongId: "lfm:song",
      artistName: "Daft Punk",
      trackName: "One More Time",
      albumName: null,
    });
    expect(mockedEnrich).not.toHaveBeenCalled();
  });
});
