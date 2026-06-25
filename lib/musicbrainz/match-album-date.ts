import "server-only";

import Bottleneck from "bottleneck";
import { withRetry } from "@/lib/http/with-retry";
import { artistMatches, trackTitleSimilarity } from "@/lib/lastfm/normalize-lastfm-search";

const MB_BASE = "https://musicbrainz.org/ws/2/release-group/";
const USER_AGENT = "Tracklist/1.0 (singh.avi99@gmail.com)";

// MusicBrainz requires max 1 request/second. Single-flight with ≥1s spacing.
const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 1100 });

// Require the artist to be identified and the title to be a strong match.
const MIN_ARTIST_SCORE = 22; // artistMatches: 30 primary / 28 full / 22 tokens
const MIN_TITLE_SCORE = 40; // trackTitleSimilarity: 50 exact / 45 substring / 40 tokens_high

export interface MusicBrainzAlbumDateMatch {
  mbid: string;
  releaseDate: string; // YYYY-MM-DD
}

interface MbArtistCredit {
  name?: string;
  artist?: { name?: string };
}

interface MbReleaseGroup {
  id: string;
  title?: string;
  "first-release-date"?: string;
  "artist-credit"?: MbArtistCredit[];
}

interface MbSearchResponse {
  "release-groups"?: MbReleaseGroup[];
}

function padReleaseDate(d: string | undefined): string | null {
  if (!d) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  if (/^\d{4}-\d{2}$/.test(d)) return `${d}-01`;
  if (/^\d{4}$/.test(d)) return `${d}-01-01`;
  return null;
}

function luceneField(s: string): string {
  return s.replace(/["\\]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Match a (Last.fm) artist+album to a MusicBrainz release-group and return its
 * first-release-date (padded to YYYY-MM-DD). Single search call; no auth.
 * Returns null on any error or when no candidate clears the score/date bars.
 */
export async function matchAlbumDateOnMusicBrainz(
  artistName: string,
  albumName: string,
): Promise<MusicBrainzAlbumDateMatch | null> {
  const a = artistName.trim();
  const al = albumName.trim();
  if (!a || !al) return null;

  try {
    const query = `artist:"${luceneField(a)}" AND releasegroup:"${luceneField(al)}"`;
    const url = `${MB_BASE}?query=${encodeURIComponent(query)}&fmt=json&limit=10`;

    const data = await limiter.schedule(() =>
      withRetry<MbSearchResponse>(
        async (sig) => {
          const res = await fetch(url, {
            signal: sig,
            headers: { "User-Agent": USER_AGENT },
          });
          if (!res.ok) throw new Error(`musicbrainz release-group HTTP ${res.status}`);
          return (await res.json()) as MbSearchResponse;
        },
        {
          label: "musicbrainz/release-group",
          timeoutMs: 10000,
          maxAttempts: 3,
          backoffBaseMs: 1000,
        },
      ),
    );

    const groups = data["release-groups"] ?? [];
    let best: MusicBrainzAlbumDateMatch & { score: number } | null = null;

    for (const rg of groups) {
      const names = (rg["artist-credit"] ?? [])
        .flatMap((ac) => [ac.name, ac.artist?.name])
        .filter((n): n is string => Boolean(n));
      const artist = artistMatches(a, names);
      const title = trackTitleSimilarity(al, rg.title ?? "");
      const releaseDate = padReleaseDate(rg["first-release-date"]);
      if (
        artist.score < MIN_ARTIST_SCORE ||
        title.score < MIN_TITLE_SCORE ||
        releaseDate === null
      ) {
        continue;
      }
      const score = artist.score + title.score;
      if (!best || score > best.score) {
        best = { mbid: rg.id, releaseDate, score };
      }
    }

    if (!best) return null;
    return { mbid: best.mbid, releaseDate: best.releaseDate };
  } catch {
    return null;
  }
}
