import { afterEach, describe, expect, it, vi } from "vitest";

const albumIdForTrack = "album-uuid-1";

// Shared mock for supabase `from` — reassignable per test via mockFrom.mockImplementation
const mockFrom = vi.fn();

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({ from: mockFrom }),
}));

// Default `from` implementation used by the existing Deezer track tests
function makeDefaultTrackFrom(albumId: string) {
  return (table: string) => {
    if (table === "tracks") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { album_id: albumId }, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
    }
    return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
  };
}

vi.mock("@/lib/catalog/entity-resolution", () => ({
  getTrackIdByExternalId: vi.fn().mockResolvedValue("lfm-track-uuid"),
  getArtistIdByExternalId: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/deezer/enrich-album-date", () => ({ enrichAlbumDateFromDeezer: vi.fn().mockResolvedValue("written") }));
vi.mock("@/lib/deezer/enrich-artist-deezer", () => ({ enrichArtistImageFromDeezer: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/lastfm/get-artist-genres", () => ({ getLastfmArtistGenres: vi.fn().mockResolvedValue({ tags: [] }) }));
vi.mock("@/lib/lastfm/get-track-duration", () => ({ getLastfmTrackDuration: vi.fn().mockResolvedValue(null) }));
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

import { resolveArtistSpotifyJob, resolveTrackSpotifyJob } from "./resolve-spotify-enrichment";
import { enrichAlbumDateFromDeezer } from "@/lib/deezer/enrich-album-date";
import { mapLastfmToSpotify } from "@/lib/lastfm/map-to-spotify";
import { searchSpotify } from "@/lib/spotify";
import { getLastfmTrackDuration } from "@/lib/lastfm/get-track-duration";
import { getLastfmArtistGenres } from "@/lib/lastfm/get-artist-genres";
import { getArtistIdByExternalId, getTrackIdByExternalId } from "@/lib/catalog/entity-resolution";

const mockedEnrich = enrichAlbumDateFromDeezer as unknown as ReturnType<typeof vi.fn>;
const mockedMapLastfmToSpotify = mapLastfmToSpotify as unknown as ReturnType<typeof vi.fn>;
const mockedSearchSpotify = searchSpotify as unknown as ReturnType<typeof vi.fn>;
const mockedGetLastfmTrackDuration = getLastfmTrackDuration as unknown as ReturnType<typeof vi.fn>;
const mockedGetLastfmArtistGenres = getLastfmArtistGenres as unknown as ReturnType<typeof vi.fn>;
const mockedGetArtistIdByExternalId = getArtistIdByExternalId as unknown as ReturnType<typeof vi.fn>;
const mockedGetTrackIdByExternalId = getTrackIdByExternalId as unknown as ReturnType<typeof vi.fn>;

afterEach(() => vi.clearAllMocks());

// ── Existing tests ────────────────────────────────────────────────────────────

describe("resolveTrackSpotifyJob — Deezer hook", () => {
  it("enriches the track's album via Deezer using the album name", async () => {
    mockFrom.mockImplementation(makeDefaultTrackFrom(albumIdForTrack));
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
    mockFrom.mockImplementation(makeDefaultTrackFrom(albumIdForTrack));
    await resolveTrackSpotifyJob({
      lfmSongId: "lfm:song",
      artistName: "Daft Punk",
      trackName: "One More Time",
      albumName: null,
    });
    expect(mockedEnrich).not.toHaveBeenCalled();
  });
});

// ── New cascade tests ─────────────────────────────────────────────────────────

describe("resolveArtistSpotifyJob — early-return when genres + image populated", () => {
  it("skips Spotify when Last.fm genres + Deezer image are both already populated", async () => {
    // artist-uuid is returned by getArtistIdByExternalId
    mockedGetArtistIdByExternalId.mockResolvedValue("artist-uuid");
    // getLastfmArtistGenres returns no new tags (irrelevant since genres already set)
    mockedGetLastfmArtistGenres.mockResolvedValue({ tags: [] });

    // First artists.select (initial read) → genres + image both set
    // Second artists.select (re-read after Deezer step) → same
    const artistSelectResult = { data: { image_url: "https://img.jpg", genres: ["Rock"] }, error: null };
    const mockArtistsUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

    mockFrom.mockImplementation((table: string) => {
      if (table === "artists") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(artistSelectResult),
            }),
          }),
          update: mockArtistsUpdate,
        };
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    });

    await resolveArtistSpotifyJob({ lfmArtistId: "lfm:artist", artistName: "Radiohead" });

    // Spotify search must NOT be called — early return fired
    expect(mockedSearchSpotify).not.toHaveBeenCalled();

    // needs_spotify_enrichment: false must be written
    expect(mockArtistsUpdate).toHaveBeenCalledWith({ needs_spotify_enrichment: false });
  });
});

describe("resolveTrackSpotifyJob — early-return when artist_id already resolved", () => {
  it("skips Spotify when artist_id is already resolved on the track row", async () => {
    mockedGetTrackIdByExternalId.mockResolvedValue("track-uuid");
    mockedGetLastfmTrackDuration.mockResolvedValue(180000);

    const mockTracksUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { artist_id: "existing-artist-id", album_id: "existing-album-id" },
                error: null,
              }),
            }),
          }),
          update: mockTracksUpdate,
        };
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    });

    await resolveTrackSpotifyJob({
      lfmSongId: "lfm:song",
      artistName: "Radiohead",
      trackName: "Creep",
      albumName: "Pablo Honey",
    });

    // Spotify lookup must NOT be called — early return fired
    expect(mockedMapLastfmToSpotify).not.toHaveBeenCalled();

    // needs_spotify_enrichment: false + duration_ms must be written
    expect(mockTracksUpdate).toHaveBeenCalledWith({
      needs_spotify_enrichment: false,
      duration_ms: 180000,
    });
  });
});
