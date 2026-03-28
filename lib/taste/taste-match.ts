import "server-only";

import type {
  TasteMatchResponse,
  TasteMatchSharedArtist,
  TasteMatchSharedGenre,
  TasteMatchUniqueGenre,
} from "@/types";
import {
  getTasteIdentity,
  getTopArtistsFromLogsForMatch,
} from "@/lib/taste/taste-identity";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { TasteGenre, TasteTopArtist } from "@/lib/taste/types";

/** Pool size for artist overlap vs denominator 20 per product spec (from live logs, not cache top-10). */
const MATCH_ARTIST_POOL = 20;
const ARTIST_WEIGHT = 0.6;
const GENRE_WEIGHT = 0.4;
const MAX_SHARED_ARTISTS = 5;
const MAX_UNIQUE_GENRES = 8;

function clamp100(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function normArtistId(id: string): string {
  return id.trim();
}

async function countUserLogs(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
): Promise<number> {
  const { count, error } = await admin
    .from("logs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) return 0;
  return count ?? 0;
}

function genreWeightMap(genres: TasteGenre[]): Map<string, { label: string; w: number }> {
  const m = new Map<string, { label: string; w: number }>();
  for (const g of genres) {
    const key = g.name.trim().toLowerCase();
    if (!key) continue;
    m.set(key, { label: g.name.trim(), w: g.weight });
  }
  return m;
}

function computeGenreOverlapScore(a: TasteGenre[], b: TasteGenre[]): number {
  const ma = genreWeightMap(a);
  const mb = genreWeightMap(b);
  if (ma.size === 0 || mb.size === 0) return 0;

  let overlapSum = 0;
  let sumA = 0;
  let sumB = 0;
  for (const { w } of ma.values()) sumA += w;
  for (const { w } of mb.values()) sumB += w;
  const denom = Math.min(sumA, sumB);
  if (denom <= 0) return 0;

  for (const [key, va] of ma) {
    const vb = mb.get(key);
    if (vb) overlapSum += Math.min(va.w, vb.w);
  }
  return clamp100((overlapSum / denom) * 100);
}

function computeArtistOverlapScore(
  sharedCount: number,
): number {
  return clamp100((sharedCount / MATCH_ARTIST_POOL) * 100);
}

function computeDiscoveryScore(
  bArtists: TasteTopArtist[],
  aIdSet: Set<string>,
): number {
  if (bArtists.length === 0) return 0;
  let total = 0;
  let novel = 0;
  for (const ar of bArtists) {
    const c = ar.listenCount ?? 0;
    total += c;
    if (!aIdSet.has(ar.id)) novel += c;
  }
  if (total <= 0) {
    const novelCount = bArtists.filter((ar) => !aIdSet.has(ar.id)).length;
    return clamp100((novelCount / Math.max(bArtists.length, 1)) * 100);
  }
  return clamp100((novel / total) * 100);
}

function buildSharedArtists(
  topA: TasteTopArtist[],
  topB: TasteTopArtist[],
  limit: number,
): TasteMatchSharedArtist[] {
  const mapB = new Map(topB.map((x) => [x.id, x]));
  const out: TasteMatchSharedArtist[] = [];
  for (const a of topA) {
    const b = mapB.get(a.id);
    if (!b) continue;
    out.push({
      id: a.id,
      name: a.name || b.name || "Artist",
      imageUrl: a.imageUrl ?? b.imageUrl ?? null,
      listenCountUserA: a.listenCount,
      listenCountUserB: b.listenCount,
    });
  }
  out.sort(
    (x, y) =>
      y.listenCountUserA +
      y.listenCountUserB -
      (x.listenCountUserA + x.listenCountUserB),
  );
  return out.slice(0, limit);
}

function buildUniqueGenres(
  a: TasteGenre[],
  b: TasteGenre[],
): { uniqueA: TasteMatchUniqueGenre[]; uniqueB: TasteMatchUniqueGenre[] } {
  const mb = genreWeightMap(b);
  const ma = genreWeightMap(a);
  const uniqueA: TasteMatchUniqueGenre[] = [];
  for (const g of a) {
    const key = g.name.trim().toLowerCase();
    if (!key || mb.has(key)) continue;
    uniqueA.push({ name: g.name.trim(), weight: g.weight });
  }
  uniqueA.sort((x, y) => y.weight - x.weight);
  const uniqueB: TasteMatchUniqueGenre[] = [];
  for (const g of b) {
    const key = g.name.trim().toLowerCase();
    if (!key || ma.has(key)) continue;
    uniqueB.push({ name: g.name.trim(), weight: g.weight });
  }
  uniqueB.sort((x, y) => y.weight - x.weight);
  return {
    uniqueA: uniqueA.slice(0, MAX_UNIQUE_GENRES),
    uniqueB: uniqueB.slice(0, MAX_UNIQUE_GENRES),
  };
}

function buildSharedGenres(
  a: TasteGenre[],
  b: TasteGenre[],
): TasteMatchSharedGenre[] {
  const ma = genreWeightMap(a);
  const mb = genreWeightMap(b);
  const out: TasteMatchSharedGenre[] = [];
  for (const [key, va] of ma) {
    const vb = mb.get(key);
    if (!vb) continue;
    out.push({
      name: va.label,
      weightUserA: va.w,
      weightUserB: vb.w,
    });
  }
  out.sort(
    (x, y) =>
      Math.min(y.weightUserA, y.weightUserB) -
      Math.min(x.weightUserA, x.weightUserB),
  );
  return out;
}

function buildSummary(
  score: number,
  sharedGenres: { name: string }[],
  sharedArtistCount: number,
): string {
  const topLabels = sharedGenres.slice(0, 3).map((g) => g.name);
  const genrePhrase =
    topLabels.length > 0 ? ` in ${topLabels.join(", ")}` : "";

  if (score > 75) {
    return sharedArtistCount > 0
      ? `Very similar taste — strong overlap in artists and genres${genrePhrase}.`
      : `Very similar taste — overlapping genres${genrePhrase}.`;
  }
  if (score > 50) {
    return sharedArtistCount > 0
      ? `Somewhat similar — you share artists and some genre ground${genrePhrase}.`
      : `Somewhat similar — some genre overlap${genrePhrase}, but different artist picks.`;
  }
  return sharedArtistCount > 0
    ? `Pretty different overall, but you still share a few artists — good for trading recs.`
    : `Your tastes look quite different — great for discovering new music from each other.`;
}

/**
 * Compare two users: genres from cached taste identity; artist overlap and discovery
 * from live log aggregation (top N artists per user) so overlap is not stuck at 0 when
 * cache is narrow or stale.
 */
export async function getTasteMatch(
  userAId: string,
  userBId: string,
): Promise<TasteMatchResponse> {
  const empty = (summary: string): TasteMatchResponse => ({
    score: 0,
    overlapScore: 0,
    genreOverlapScore: 0,
    discoveryScore: 0,
    sharedArtists: [],
    sharedGenres: [],
    uniqueGenresUserA: [],
    uniqueGenresUserB: [],
    summary,
    insufficientData: true,
  });

  if (!userAId?.trim() || !userBId?.trim()) {
    return empty("Missing user.");
  }
  if (userAId === userBId) {
    return {
      score: 100,
      overlapScore: 100,
      genreOverlapScore: 100,
      discoveryScore: 0,
      sharedArtists: [],
      sharedGenres: [],
      uniqueGenresUserA: [],
      uniqueGenresUserB: [],
      summary: "Same listener — that’s a perfect match (and no discovery gap).",
      insufficientData: false,
    };
  }

  const uidA = userAId.trim();
  const uidB = userBId.trim();
  const admin = createSupabaseAdminClient();

  const [identityA, identityB, topA, topB, logCountA, logCountB] =
    await Promise.all([
      getTasteIdentity(uidA),
      getTasteIdentity(uidB),
      getTopArtistsFromLogsForMatch(admin, uidA, MATCH_ARTIST_POOL),
      getTopArtistsFromLogsForMatch(admin, uidB, MATCH_ARTIST_POOL),
      countUserLogs(admin, uidA),
      countUserLogs(admin, uidB),
    ]);

  if (logCountA === 0 || logCountB === 0) {
    return empty(
      "Not enough listening data yet — log more music and refresh taste identity.",
    );
  }

  const setA = new Set(topA.map((x) => normArtistId(x.id)));
  const setB = new Set(topB.map((x) => normArtistId(x.id)));

  let sharedCount = 0;
  for (const id of setA) {
    if (setB.has(id)) sharedCount += 1;
  }

  const topANorm = topA.map((a) => ({
    ...a,
    id: normArtistId(a.id),
  }));
  const topBNorm = topB.map((a) => ({
    ...a,
    id: normArtistId(a.id),
  }));

  const overlapScore = computeArtistOverlapScore(sharedCount);
  const genreOverlapScore = computeGenreOverlapScore(
    identityA.topGenres,
    identityB.topGenres,
  );

  const score = clamp100(
    ARTIST_WEIGHT * overlapScore + GENRE_WEIGHT * genreOverlapScore,
  );

  const discoveryScore = computeDiscoveryScore(topBNorm, setA);

  const sharedArtists = buildSharedArtists(
    topANorm,
    topBNorm,
    MAX_SHARED_ARTISTS,
  );
  const sharedGenres = buildSharedGenres(identityA.topGenres, identityB.topGenres);
  const { uniqueA, uniqueB } = buildUniqueGenres(
    identityA.topGenres,
    identityB.topGenres,
  );

  const summary = buildSummary(score, sharedGenres, sharedArtists.length);

  return {
    score,
    overlapScore,
    genreOverlapScore,
    discoveryScore,
    sharedArtists,
    sharedGenres,
    uniqueGenresUserA: uniqueA,
    uniqueGenresUserB: uniqueB,
    summary,
    insufficientData: false,
  };
}
