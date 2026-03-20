import type { LeaderboardEntry } from "../services/leaderboardService";
import type { RisingArtist } from "../services/discoverService";

/** Placeholder Spotify-style id (22 base62 chars) for example payloads. */
function sid(seed: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 22; i++) {
    s += alphabet[(seed * 31 + i * 7) % alphabet.length];
  }
  return s;
}

export function exampleLeaderboardItems(
  type: "popular" | "topRated" | "mostFavorited",
  entity: "song" | "album",
  limit: number,
): LeaderboardEntry[] {
  const n = Math.min(Math.max(1, limit), 8);
  return Array.from({ length: n }, (_, i) => {
    const base = {
      id: sid(i + 1),
      entity_type: entity,
      name: entity === "song" ? `Example Track ${i + 1}` : `Example Album ${i + 1}`,
      artist: `Example Artist ${i + 1}`,
      artwork_url: null as string | null,
      total_plays: 1000 - i * 100,
      average_rating: type === "popular" ? 4.0 + (i % 10) / 10 : 4.5 - i * 0.1,
    };
    if (type === "topRated") {
      return {
        ...base,
        weighted_score: (base.average_rating ?? 0) * Math.log10(1 + base.total_plays),
      };
    }
    if (type === "mostFavorited") {
      return { ...base, entity_type: "album", favorite_count: 50 - i * 5 };
    }
    return base;
  });
}

export function exampleRisingArtists(limit: number): RisingArtist[] {
  const n = Math.min(Math.max(1, limit), 8);
  return Array.from({ length: n }, (_, i) => ({
    artist_id: sid(100 + i),
    name: `Rising Artist ${i + 1}`,
    avatar_url: null,
    growth: 12.5 - i,
  }));
}
