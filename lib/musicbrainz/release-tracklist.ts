import "server-only";

import Bottleneck from "bottleneck";
import { withRetry } from "@/lib/http/with-retry";

const MB_BASE = "https://musicbrainz.org/ws/2";
const USER_AGENT = "Tracklist/1.0 (singh.avi99@gmail.com)";

// MusicBrainz requires max 1 request/second.
const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 1100 });

export interface MbTrack {
  title: string;
  trackNumber: number;
  discNumber: number;
}

interface MbReleaseTrack {
  position?: number;
  number?: string;
  title?: string;
  recording?: { title?: string };
}
interface MbMedium {
  position?: number;
  tracks?: MbReleaseTrack[];
}
interface MbRelease {
  id: string;
  status?: string;
  media?: MbMedium[];
}
interface MbReleaseBrowse {
  releases?: MbRelease[];
}

async function mbGet<T>(url: string, label: string): Promise<T | null> {
  try {
    return await limiter.schedule(() =>
      withRetry<T>(
        async (sig) => {
          const res = await fetch(url, { signal: sig, headers: { "User-Agent": USER_AGENT } });
          if (!res.ok) throw new Error(`musicbrainz ${label} HTTP ${res.status}`);
          return (await res.json()) as T;
        },
        { label: `musicbrainz/${label}`, timeoutMs: 10000, maxAttempts: 3, backoffBaseMs: 1000 },
      ),
    );
  } catch {
    return null;
  }
}

function totalTracks(r: MbRelease): number {
  return (r.media ?? []).reduce((sum, m) => sum + (m.tracks?.length ?? 0), 0);
}

/** Pick the most complete release, preferring Official status. */
function pickBestRelease(releases: MbRelease[]): MbRelease | null {
  if (releases.length === 0) return null;
  const official = releases.filter((r) => r.status === "Official");
  const pool = official.length > 0 ? official : releases;
  return pool.reduce((best, r) => (totalTracks(r) > totalTracks(best) ? r : best), pool[0]);
}

function flattenTracklist(release: MbRelease): MbTrack[] {
  const out: MbTrack[] = [];
  const media = release.media ?? [];
  media.forEach((medium, idx) => {
    const disc = typeof medium.position === "number" ? medium.position : idx + 1;
    (medium.tracks ?? []).forEach((t, tIdx) => {
      const title = t.title ?? t.recording?.title ?? "";
      const trackNumber = typeof t.position === "number" ? t.position : tIdx + 1;
      out.push({ title, trackNumber, discNumber: disc });
    });
  });
  return out;
}

/**
 * Fetch an album's ordered tracklist from MusicBrainz. Requires the release-group
 * mbid (albums backfilled for dates already carry one in albums.mbid). Returns []
 * on any error or when no release/tracks are found. Single browse call.
 */
export async function getMusicBrainzTracklist(
  _artistName: string,
  _albumName: string,
  releaseGroupMbid: string,
): Promise<MbTrack[]> {
  if (!releaseGroupMbid) return [];
  const url = `${MB_BASE}/release?release-group=${encodeURIComponent(releaseGroupMbid)}&inc=recordings&fmt=json&limit=25`;
  const data = await mbGet<MbReleaseBrowse>(url, "release-browse");
  const release = pickBestRelease(data?.releases ?? []);
  if (!release) return [];
  return flattenTracklist(release);
}
