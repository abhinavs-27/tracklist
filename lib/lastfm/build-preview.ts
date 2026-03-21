import "server-only";

import type { LastfmNormalizedScrobble, LastfmPreviewRow } from "./types";
import { fetchLastfmRecentTracksSafe } from "./fetch-recent";
import { mapLastfmToSpotify } from "./map-to-spotify";

const MAP_CONCURRENCY = 4;

function isLastfmPreviewDebug(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.TRACKLIST_DEBUG_LASTFM_MAPPING === "1"
  );
}

export type LastfmPreviewBuildResult = {
  items: LastfmPreviewRow[];
  matchedCount: number;
  skippedCount: number;
  fetchError: string | null;
  fetchErrorCode: string | null;
};

async function mapWithConcurrency(
  items: LastfmNormalizedScrobble[],
): Promise<{ rows: LastfmPreviewRow[]; skippedCount: number }> {
  const rows: LastfmPreviewRow[] = [];
  let skippedCount = 0;
  const droppedSamples: Array<{
    track: string;
    artist: string;
    album: string | null;
  }> = [];

  for (let i = 0; i < items.length; i += MAP_CONCURRENCY) {
    const chunk = items.slice(i, i + MAP_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (s) => {
        const match = await mapLastfmToSpotify(
          s.trackName,
          s.artistName,
          s.albumName,
        );
        if (!match) {
          return { ok: false as const, s };
        }
        return {
          ok: true as const,
          row: {
            ...s,
            matchStatus: "matched" as const,
            spotifyTrackId: match.trackId,
            albumId: match.albumId,
            artistId: match.artistId,
          } satisfies LastfmPreviewRow,
        };
      }),
    );
    for (const r of results) {
      if (r.ok) rows.push(r.row);
      else {
        skippedCount++;
        if (isLastfmPreviewDebug() && droppedSamples.length < 15) {
          droppedSamples.push({
            track: r.s.trackName,
            artist: r.s.artistName,
            album: r.s.albumName,
          });
        }
      }
    }
  }

  if (isLastfmPreviewDebug() && skippedCount > 0) {
    console.log("[lastfm preview] dropped unmatched (not shown in preview)", {
      count: skippedCount,
      sample: droppedSamples,
    });
  }

  return { rows, skippedCount };
}

/**
 * Map normalized scrobbles through the Spotify resolver (queue-style chunks of 4).
 * Only matched rows are returned (no unmatched / unknown tracks).
 */
export async function mapScrobblesToPreviewRows(
  items: LastfmNormalizedScrobble[],
): Promise<LastfmPreviewRow[]> {
  const { rows } = await mapWithConcurrency(items);
  return rows;
}

export async function buildLastfmPreview(
  username: string,
  limit: number,
): Promise<LastfmPreviewBuildResult> {
  const fetchResult = await fetchLastfmRecentTracksSafe(username, limit);
  if (!fetchResult.ok) {
    return {
      items: [],
      matchedCount: 0,
      skippedCount: 0,
      fetchError: fetchResult.error,
      fetchErrorCode: fetchResult.errorCode ?? null,
    };
  }

  const { rows, skippedCount } = await mapWithConcurrency(fetchResult.tracks);

  return {
    items: rows,
    matchedCount: rows.length,
    skippedCount,
    fetchError: null,
    fetchErrorCode: null,
  };
}
