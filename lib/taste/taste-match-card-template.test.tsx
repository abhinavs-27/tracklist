// lib/taste/taste-match-card-template.test.tsx
import { describe, it, expect } from "vitest";
import {
  buildTasteMatchCardModel,
  TasteMatchCardTemplate,
} from "./taste-match-card-template";
import type { TasteMatchResponse } from "@/types";

const sample: TasteMatchResponse = {
  score: 87,
  overlapScore: 64,
  genreOverlapScore: 41,
  discoveryScore: 72,
  sharedArtists: Array.from({ length: 12 }, (_, i) => ({
    id: `a${i}`,
    name: `Artist ${i}`,
    imageUrl: null,
    listenCountUserA: 10 + i,
    listenCountUserB: 5 + i,
  })),
  sharedGenres: Array.from({ length: 14 }, (_, i) => ({
    name: `genre ${i}`,
    weightUserA: 20 - i,
    weightUserB: 18 - i,
  })),
  uniqueGenresUserA: Array.from({ length: 9 }, (_, i) => ({ name: `ua${i}`, weight: 9 - i })),
  uniqueGenresUserB: Array.from({ length: 9 }, (_, i) => ({ name: `ub${i}`, weight: 9 - i })),
  summary: "You and they are a strong match.",
  insufficientData: false,
  startHere: null,
};

describe("buildTasteMatchCardModel", () => {
  it("caps lists and builds a meta line", () => {
    const m = buildTasteMatchCardModel(sample, "You", "Them");
    expect(m.score).toBe(87);
    expect(m.metaLine).toBe("Overlap 64% · Genre 41% · Discovery 72%");
    expect(m.sharedArtists).toHaveLength(8);
    expect(m.sharedArtists[0]).toEqual({ name: "Artist 0", right: "You 10 · Them 5" });
    expect(m.sharedGenres).toHaveLength(10);
    expect(m.sharedGenres[0]).toEqual({ name: "genre 0", right: "You 20% · Them 18%" });
    expect(m.uniqueA).toHaveLength(6);
    expect(m.uniqueB).toHaveLength(6);
  });

  it("handles empty arrays without throwing", () => {
    const empty: TasteMatchResponse = {
      ...sample,
      sharedArtists: [],
      sharedGenres: [],
      uniqueGenresUserA: [],
      uniqueGenresUserB: [],
    };
    const m = buildTasteMatchCardModel(empty, "You", "Them");
    expect(m.sharedArtists).toEqual([]);
  });
});

describe("TasteMatchCardTemplate", () => {
  it("returns a renderable element tree", () => {
    const el = TasteMatchCardTemplate({ match: sample });
    expect(el).toBeTruthy();
    expect((el as { type?: unknown }).type).toBeDefined();
  });
});
