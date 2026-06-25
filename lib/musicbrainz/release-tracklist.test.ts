import { afterEach, describe, expect, it, vi } from "vitest";

function mockFetchOnce(json: unknown, ok = true, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status, json: async () => json } as Response));
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

import { getMusicBrainzTracklist } from "./release-tracklist";

describe("getMusicBrainzTracklist", () => {
  it("parses media[].tracks[] into ordered tracks using a known rgid", async () => {
    mockFetchOnce({
      releases: [
        {
          id: "rel-1",
          status: "Official",
          media: [
            { position: 1, tracks: [
              { position: 1, number: "1", title: "Intro", recording: { title: "Intro" } },
              { position: 2, number: "2", title: "Song Two", recording: { title: "Song Two" } },
            ] },
            { position: 2, tracks: [
              { position: 1, number: "1", title: "Disc Two Opener", recording: { title: "Disc Two Opener" } },
            ] },
          ],
        },
      ],
    });
    const out = await getMusicBrainzTracklist("Some Artist", "Some Album", "rg-123");
    expect(out).toEqual([
      { title: "Intro", trackNumber: 1, discNumber: 1 },
      { title: "Song Two", trackNumber: 2, discNumber: 1 },
      { title: "Disc Two Opener", trackNumber: 1, discNumber: 2 },
    ]);
    const url = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/ws/2/release");
    expect(url).toContain("release-group=rg-123");
    expect(url).toContain("inc=recordings");
  });

  it("prefers the Official release with the most tracks", async () => {
    mockFetchOnce({
      releases: [
        { id: "promo", status: "Promotion", media: [{ position: 1, tracks: [{ position: 1, title: "X", recording: { title: "X" } }] }] },
        { id: "official", status: "Official", media: [{ position: 1, tracks: [
          { position: 1, title: "A", recording: { title: "A" } },
          { position: 2, title: "B", recording: { title: "B" } },
        ] }] },
      ],
    });
    const out = await getMusicBrainzTracklist("Artist", "Album", "rg-1");
    expect(out.map((t) => t.title)).toEqual(["A", "B"]);
  });

  it("uses recording.title when track.title is absent", async () => {
    mockFetchOnce({
      releases: [{ id: "r", status: "Official", media: [{ position: 1, tracks: [
        { position: 1, recording: { title: "FromRecording" } },
      ] }] }],
    });
    const out = await getMusicBrainzTracklist("Artist", "Album", "rg-1");
    expect(out).toEqual([{ title: "FromRecording", trackNumber: 1, discNumber: 1 }]);
  });

  it("returns [] when there are no releases", async () => {
    mockFetchOnce({ releases: [] });
    expect(await getMusicBrainzTracklist("Artist", "Album", "rg-1")).toEqual([]);
  });

  it("returns [] and does not throw on HTTP error", async () => {
    mockFetchOnce({}, false, 503);
    expect(await getMusicBrainzTracklist("Artist", "Album", "rg-1")).toEqual([]);
  });
});
