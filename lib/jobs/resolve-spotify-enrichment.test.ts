import { afterEach, describe, expect, it, vi } from "vitest";

const albumIdForTrack = "album-uuid-1";

vi.mock("@/lib/analytics/repair-artist-aggregates", () => ({
  repairMissingArtistAggregates: vi.fn().mockResolvedValue({ inserted: 0, errors: 0 }),
}));

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
import { repairMissingArtistAggregates } from "@/lib/analytics/repair-artist-aggregates";

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

// ── Post-enrichment repair tests ──────────────────────────────────────────────

describe("resolveTrackSpotifyJob — post-enrichment aggregate repair", () => {
  it("calls repairMissingArtistAggregates for users with logs after artist_id is resolved", async () => {
    mockedGetTrackIdByExternalId.mockResolvedValue("lfm-track-uuid");

    // Spotify path: mapLastfmToSpotify returns a match
    mockedMapLastfmToSpotify.mockResolvedValue({ trackId: "spotify-track-id" });

    const { getTrack, searchSpotify: _s } = await import("@/lib/spotify");
    const { upsertTrackFromSpotify, upsertArtistFromSpotify } = await import("@/lib/spotify-cache");
    const { mergeCanonicalTracks, mergeCanonicalArtists } = await import("@/lib/catalog/merge-canonical");

    (getTrack as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "spotify-track-id",
      artists: [{ id: "spotify-artist-id", name: "Artist" }],
      album: { id: "spotify-album-id", name: "Album", images: [] },
    });
    (upsertTrackFromSpotify as ReturnType<typeof vi.fn>).mockResolvedValue("spotify-track-uuid");
    (upsertArtistFromSpotify as ReturnType<typeof vi.fn>).mockResolvedValue("spotify-artist-uuid");
    (mergeCanonicalTracks as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (mergeCanonicalArtists as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    // artist_id is NULL → takes the Spotify path
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { artist_id: null, album_id: null },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      if (table === "logs") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: [{ user_id: "user-a" }, { user_id: "user-b" }],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "listens") {
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ error: null }),
              }),
            }),
          }),
        };
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    });

    await resolveTrackSpotifyJob({
      lfmSongId: "lfm:song",
      artistName: "Artist",
      trackName: "Track",
      albumName: "Album",
    });

    // Allow fire-and-forget promises to settle
    await new Promise((r) => setTimeout(r, 0));

    const repairMock = repairMissingArtistAggregates as ReturnType<typeof vi.fn>;
    expect(repairMock).toHaveBeenCalledTimes(2);
    expect(repairMock).toHaveBeenCalledWith({ userId: "user-a" });
    expect(repairMock).toHaveBeenCalledWith({ userId: "user-b" });
  });

  it("does NOT call repairMissingArtistAggregates on the early-return path (artist_id already set)", async () => {
    mockedGetTrackIdByExternalId.mockResolvedValue("track-uuid");
    mockedGetLastfmTrackDuration.mockResolvedValue(null);

    // artist_id already set → early return fires
    mockFrom.mockImplementation((table: string) => {
      if (table === "tracks") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { artist_id: "existing-artist-id", album_id: null },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) };
    });

    await resolveTrackSpotifyJob({
      lfmSongId: "lfm:song",
      artistName: "Radiohead",
      trackName: "Creep",
      albumName: null,
    });

    const repairMock = repairMissingArtistAggregates as ReturnType<typeof vi.fn>;
    expect(repairMock).not.toHaveBeenCalled();
  });
});
