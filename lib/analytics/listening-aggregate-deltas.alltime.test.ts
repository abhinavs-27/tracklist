import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  accumulateListeningAggregateDeltas,
  parseBucket,
  type AggregateLogRow,
  type AggregateCatalogContext,
} from "./listening-aggregate-deltas";

const FS = "\x1f";

const LOG: AggregateLogRow = {
  id: "log-1",
  user_id: "user-1",
  listened_at: "2024-06-15T12:00:00Z",
  created_at: "2024-06-15T12:00:00Z",
  track_id: "track-1",
  album_id: null,
  artist_id: null,
};

const CTX: AggregateCatalogContext = {
  songByTrack: new Map([["track-1", { artist_id: "artist-1", album_id: "album-1" }]]),
  albumById: new Map([["album-1", { artist_id: "artist-1" }]]),
  artistById: new Map([["artist-1", { id: "artist-1", genres: ["rap"] }]]),
};

// Regression guard for the artist-social-tab "reads 0" bug: every "all-time" read
// targets the row WHERE week_start/month/year are all NULL. If the write path
// stops emitting that bucket, those reads silently fall back to matching
// monthly/yearly rows and break. These tests fail if the all-time bucket is dropped.
describe("accumulateListeningAggregateDeltas — all-time bucket", () => {
  it("emits an all-time bucket ('a:') for every entity type, alongside week/month/year", () => {
    const { deltas } = accumulateListeningAggregateDeltas([LOG], CTX, {
      includeTrackBumps: true,
    });

    for (const [entityType, entityId] of [
      ["artist", "artist-1"],
      ["album", "album-1"],
      ["track", "track-1"],
      ["genre", "rap"],
    ] as const) {
      const allTimeKey = ["user-1", entityType, entityId, "a:"].join(FS);
      expect(deltas.get(allTimeKey)).toBe(1);

      // Exactly 4 buckets per entity: week, month, year, all-time.
      const prefix = ["user-1", entityType, entityId].join(FS) + FS;
      const buckets = [...deltas.keys()].filter((k) => k.startsWith(prefix));
      expect(buckets).toHaveLength(4);
    }
  });

  it("parseBucket maps the all-time key to all-NULL bucket columns", () => {
    expect(parseBucket("a:")).toEqual({
      p_week_start: null,
      p_month: null,
      p_year: null,
    });
  });
});
