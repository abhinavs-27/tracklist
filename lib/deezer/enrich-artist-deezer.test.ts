import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({ searchDeezerArtists: vi.fn() }));

import { searchDeezerArtists } from "./client";
import { enrichArtistImageFromDeezer } from "./enrich-artist-deezer";

const mockedSearch = searchDeezerArtists as unknown as ReturnType<typeof vi.fn>;

function makeSupabase() {
  const is = vi.fn().mockResolvedValue({ error: null });
  const eq = vi.fn().mockReturnValue({ is });
  const update = vi.fn().mockReturnValue({ eq });
  return {
    supabase: {
      from: vi.fn().mockReturnValue({ update }),
    },
    update,
    eq,
    is,
  };
}

afterEach(() => vi.clearAllMocks());

describe("enrichArtistImageFromDeezer", () => {
  it("writes image_url when Deezer returns a valid image", async () => {
    mockedSearch.mockResolvedValue([
      {
        id: 1,
        name: "Radiohead",
        picture_xl:
          "https://e-cdns-images.dzcdn.net/images/artist/abc123/1000x1000.jpg",
        nb_fan: 5000,
      },
    ]);

    const { supabase, update, eq, is } = makeSupabase();
    const result = await enrichArtistImageFromDeezer(
      supabase as never,
      "uuid-123",
      "Radiohead",
    );

    expect(result.enriched).toBe(true);
    expect(update).toHaveBeenCalledWith({
      image_url:
        "https://e-cdns-images.dzcdn.net/images/artist/abc123/1000x1000.jpg",
    });
    expect(eq).toHaveBeenCalledWith("id", "uuid-123");
    expect(is).toHaveBeenCalledWith("image_url", null);
  });

  it("returns enriched=false when picture_xl is a Deezer placeholder", async () => {
    mockedSearch.mockResolvedValue([
      {
        id: 2,
        name: "Unknown Artist",
        picture_xl:
          "https://e-cdns-images.dzcdn.net/images/artist//1000x1000-000000-80-0-0.jpg",
        nb_fan: 0,
      },
    ]);

    const { supabase, update } = makeSupabase();
    const result = await enrichArtistImageFromDeezer(
      supabase as never,
      "uuid-456",
      "Unknown Artist",
    );

    expect(result.enriched).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns enriched=false when no results returned", async () => {
    mockedSearch.mockResolvedValue([]);

    const { supabase, update } = makeSupabase();
    const result = await enrichArtistImageFromDeezer(
      supabase as never,
      "uuid-789",
      "Ghost Artist",
    );

    expect(result.enriched).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("prefers exact normalized name match over first result", async () => {
    mockedSearch.mockResolvedValue([
      {
        id: 999,
        name: "The Radio Head Band",
        picture_xl:
          "https://e-cdns-images.dzcdn.net/images/artist/wrong/1000x1000.jpg",
      },
      {
        id: 1,
        name: "Radiohead",
        picture_xl:
          "https://e-cdns-images.dzcdn.net/images/artist/abc123/1000x1000.jpg",
      },
    ]);

    const { supabase, update } = makeSupabase();
    const result = await enrichArtistImageFromDeezer(
      supabase as never,
      "uuid-match",
      "Radiohead",
    );

    expect(result.enriched).toBe(true);
    expect(update).toHaveBeenCalledWith({
      image_url:
        "https://e-cdns-images.dzcdn.net/images/artist/abc123/1000x1000.jpg",
    });
  });

  it("falls back to first result when no exact match", async () => {
    mockedSearch.mockResolvedValue([
      {
        id: 1,
        name: "Slightly Different Name",
        picture_xl:
          "https://e-cdns-images.dzcdn.net/images/artist/best/1000x1000.jpg",
      },
    ]);

    const { supabase, update } = makeSupabase();
    const result = await enrichArtistImageFromDeezer(
      supabase as never,
      "uuid-fallback",
      "The Artist",
    );

    expect(result.enriched).toBe(true);
    expect(update).toHaveBeenCalledWith({
      image_url:
        "https://e-cdns-images.dzcdn.net/images/artist/best/1000x1000.jpg",
    });
  });

  it("returns enriched=false on Supabase error", async () => {
    mockedSearch.mockResolvedValue([
      {
        id: 1,
        name: "Radiohead",
        picture_xl:
          "https://e-cdns-images.dzcdn.net/images/artist/abc123/1000x1000.jpg",
      },
    ]);

    const is = vi.fn().mockResolvedValue({ error: new Error("db error") });
    const eq = vi.fn().mockReturnValue({ is });
    const update = vi.fn().mockReturnValue({ eq });
    const supabase = { from: vi.fn().mockReturnValue({ update }) };

    const result = await enrichArtistImageFromDeezer(
      supabase as never,
      "uuid-error",
      "Radiohead",
    );

    expect(result.enriched).toBe(false);
  });

  it("returns enriched=false on search exception", async () => {
    mockedSearch.mockRejectedValue(new Error("network error"));

    const { supabase, update } = makeSupabase();
    const result = await enrichArtistImageFromDeezer(
      supabase as never,
      "uuid-exception",
      "Radiohead",
    );

    expect(result.enriched).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});
