import "server-only";

import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fetchLastfmApi } from "@/lib/lastfm/lastfm-api-fetch";
import { genreKey, genreLabel } from "@/lib/taste/normalize-genre";

// ─── Constants ────────────────────────────────────────────────────────────────

const SEEDS_MAX = 8;       // max genre-diverse seeds
const SIMILAR_LIMIT = 30;  // Last.fm similar artists per seed
const TAG_GENRES = 4;      // top user genres to query via tag.getTopArtists
const TAG_LIMIT = 40;      // Last.fm tag top artists per genre
const RESULT_COUNT = 6;    // final results to return
const MAX_PER_GENRE = 2;   // max results sharing the same primary genre bucket
const SIMILAR_SLOTS = 4;   // target slots from similar-artist pool
const TAG_SLOTS = 2;       // target slots from genre-tag pool

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlindSpotArtist = {
  spotifyId: string;
  name: string;
  imageUrl?: string;
  genres: string[];
  becauseOf: string[];
  source?: "similar" | "tag";
};

export type TasteBlindSpotsResult = {
  artists: BlindSpotArtist[];
  hasData: boolean;
};

// ─── Last.fm API ──────────────────────────────────────────────────────────────

type LastfmArtistName = { name: string };

async function fetchSimilarArtists(artistName: string): Promise<LastfmArtistName[]> {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey) return [];
  try {
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    url.searchParams.set("method", "artist.getSimilar");
    url.searchParams.set("artist", artistName);
    url.searchParams.set("limit", String(SIMILAR_LIMIT));
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    const res = await fetchLastfmApi(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { similarartists?: { artist?: LastfmArtistName[] } };
    return data.similarartists?.artist ?? [];
  } catch (e) {
    console.warn(`    fetchSimilarArtists("${artistName}") failed:`, e instanceof Error ? e.message : String(e));
    return [];
  }
}

async function fetchTagTopArtists(tag: string): Promise<string[]> {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey) return [];
  try {
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    url.searchParams.set("method", "tag.gettopartists");
    url.searchParams.set("tag", tag);
    url.searchParams.set("limit", String(TAG_LIMIT));
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    const res = await fetchLastfmApi(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { topartists?: { artist?: LastfmArtistName[] } };
    return (data.topartists?.artist ?? []).map((a) => a.name);
  } catch (e) {
    console.warn(`    fetchTagTopArtists("${tag}") failed:`, e instanceof Error ? e.message : String(e));
    return [];
  }
}

// ─── Main computation ─────────────────────────────────────────────────────────

async function computeBlindSpots(userId: string): Promise<TasteBlindSpotsResult> {
  const EMPTY: TasteBlindSpotsResult = { artists: [], hasData: false };
  const admin = createSupabaseAdminClient();
  const short = userId.slice(0, 8);

  if (!process.env.LASTFM_API_KEY?.trim()) {
    console.warn(`  [${short}] LASTFM_API_KEY not set — skipping`);
    return EMPTY;
  }

  // 1 — Load snapshots (top_artists for seeds, top_genres for tag pool).
  console.log(`  [${short}] fetching snapshots...`);
  const { data: snapshots, error: snapErr } = await admin
    .from("taste_snapshots")
    .select("snapshot_month, top_artists, top_genres")
    .eq("user_id", userId)
    .order("snapshot_month", { ascending: false });

  if (snapErr || !snapshots || snapshots.length === 0) return EMPTY;

  type ArtistEntry = { id: string; name: string; plays: number };
  type GenreEntry = { name: string; weight: number };
  type Snapshot = { snapshot_month: string; top_artists: ArtistEntry[]; top_genres: GenreEntry[] };

  // All artists ever in top-10 monthly, keyed by lowercase name.
  const recentTopByName = new Map<string, ArtistEntry>();
  for (const snap of snapshots as Snapshot[]) {
    for (const a of snap.top_artists ?? []) {
      const key = a.name.toLowerCase().trim();
      if (!recentTopByName.has(key)) recentTopByName.set(key, a);
    }
  }

  if (recentTopByName.size === 0) return EMPTY;

  // 2 — Build the complete played-names filter from user_listening_aggregates.
  console.log(`  [${short}] fetching all played artist IDs...`);
  const { data: aggRows } = await admin
    .from("user_listening_aggregates")
    .select("entity_id")
    .eq("user_id", userId)
    .eq("entity_type", "artist");

  const allPlayedIds = [
    ...new Set((aggRows ?? []).map((r) => r.entity_id as string).filter(Boolean)),
  ];

  const playedNames = new Set<string>(recentTopByName.keys());
  for (let i = 0; i < allPlayedIds.length; i += 500) {
    const { data: nameRows } = await admin
      .from("artists")
      .select("name")
      .in("id", allPlayedIds.slice(i, i + 500));
    for (const r of (nameRows ?? []) as { name: string }[]) {
      playedNames.add(r.name.toLowerCase().trim());
    }
  }
  console.log(`  [${short}] ${playedNames.size} total played artists (filter set)`);

  // 3 — Genre-diverse seed selection.
  //     Look up genres for seed-candidate artists, group by primary genre,
  //     pick the highest-plays artist per genre bucket.
  const seedCandidateIds = [
    ...new Set([...recentTopByName.values()].map((a) => a.id).filter(Boolean)),
  ];

  const seedGenreMap = new Map<string, string[]>();
  if (seedCandidateIds.length > 0) {
    const { data: seedGenreRows } = await admin
      .from("artists")
      .select("id, genres")
      .in("id", seedCandidateIds);
    for (const r of (seedGenreRows ?? []) as { id: string; genres: string[] | null }[]) {
      seedGenreMap.set(r.id, r.genres ?? []);
    }
  }

  const byGenreBucket = new Map<string, ArtistEntry>();
  for (const artist of recentTopByName.values()) {
    const rawGenres = seedGenreMap.get(artist.id) ?? [];
    const bucket = rawGenres[0] ? genreKey(rawGenres[0]) : "__other__";
    const cur = byGenreBucket.get(bucket);
    if (!cur || artist.plays > cur.plays) byGenreBucket.set(bucket, artist);
  }

  const seeds = [...byGenreBucket.values()].slice(0, SEEDS_MAX);

  // Throwback seed: top artist from the oldest snapshot if not already a seed.
  if (snapshots.length > 3) {
    const oldest = (snapshots[snapshots.length - 1] as Snapshot).top_artists?.[0];
    if (oldest && !seeds.some((s) => s.name.toLowerCase() === oldest.name.toLowerCase())) {
      seeds.push(oldest);
    }
  }

  console.log(`  [${short}] ${seeds.length} genre-diverse seeds`);

  // 4 — Similar-artist pool: fetchSimilarArtists for each seed.
  type SimilarCandidate = { name: string; nameLower: string; becauseOf: string[]; score: number };
  const similarMap = new Map<string, SimilarCandidate>();

  for (const seed of seeds) {
    console.log(`  [${short}] → similar for "${seed.name}"...`);
    const similar = await fetchSimilarArtists(seed.name);
    for (const s of similar) {
      const key = s.name.toLowerCase().trim();
      if (playedNames.has(key)) continue;
      const existing = similarMap.get(key);
      if (existing) {
        existing.becauseOf.push(seed.name);
        existing.score++;
      } else {
        similarMap.set(key, { name: s.name, nameLower: key, becauseOf: [seed.name], score: 1 });
      }
    }
  }

  const similarPool = [...similarMap.values()].sort((a, b) => b.score - a.score);

  // 5 — Genre-tag pool: fetchTagTopArtists for the user's top genres.
  //     Source the genre list from the most recent snapshot.
  type TagCandidate = { name: string; nameLower: string; becauseOf: string[] };
  const tagPool: TagCandidate[] = [];
  const tagSeen = new Set<string>();

  const recentGenres = ((snapshots[0] as Snapshot)?.top_genres ?? [])
    .slice(0, TAG_GENRES)
    .map((g) => ({ key: genreKey(g.name), label: genreLabel(g.name) }));

  for (const { key: tag, label } of recentGenres) {
    console.log(`  [${short}] → tag top artists for "${tag}"...`);
    const tagArtists = await fetchTagTopArtists(tag);
    for (const name of tagArtists) {
      const nameLower = name.toLowerCase().trim();
      if (playedNames.has(nameLower)) continue;
      if (tagSeen.has(nameLower)) continue;
      tagSeen.add(nameLower);
      tagPool.push({ name, nameLower, becauseOf: [`Top in ${label}`] });
    }
  }

  if (similarPool.length === 0 && tagPool.length === 0) return EMPTY;

  // 6 — Fetch DB metadata for all candidates (image, id, genres).
  const allCandidateNames = [
    ...new Set([
      ...similarPool.slice(0, 20).map((c) => c.nameLower),
      ...tagPool.slice(0, 20).map((c) => c.nameLower),
    ]),
  ];

  type ArtistRow = { id: string; name: string; image_url: string | null; genres: string[] | null };
  const { data: artistRows } = await admin
    .from("artists")
    .select("id, name, image_url, genres")
    .in("name_normalized", allCandidateNames);

  const dbByName = new Map<string, ArtistRow>(
    (artistRows ?? []).map((r) => [(r.name as string).toLowerCase().trim(), r as ArtistRow]),
  );

  // 7 — Slot-based selection with genre dedup.
  //     Target: SIMILAR_SLOTS from similar pool, TAG_SLOTS from tag pool.
  //     Enforce MAX_PER_GENRE across all slots.
  type Slot = { name: string; nameLower: string; becauseOf: string[]; source: "similar" | "tag"; db: ArtistRow | undefined };

  const selected: Slot[] = [];
  const usedNames = new Set<string>();
  const genreCounts = new Map<string, number>();

  function primaryGenre(nameLower: string): string {
    const db = dbByName.get(nameLower);
    const raw = db?.genres?.[0];
    return raw ? genreKey(raw) : nameLower;
  }

  function trySlot(slot: Omit<Slot, "db">): boolean {
    if (usedNames.has(slot.nameLower)) return false;
    const genre = primaryGenre(slot.nameLower);
    if ((genreCounts.get(genre) ?? 0) >= MAX_PER_GENRE) return false;
    selected.push({ ...slot, db: dbByName.get(slot.nameLower) });
    usedNames.add(slot.nameLower);
    genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    return true;
  }

  // Fill similar slots.
  for (const c of similarPool) {
    if (selected.filter((s) => s.source === "similar").length >= SIMILAR_SLOTS) break;
    trySlot({ ...c, source: "similar" });
  }

  // Fill tag slots.
  for (const c of tagPool) {
    if (selected.filter((s) => s.source === "tag").length >= TAG_SLOTS) break;
    // Skip if already surfaced via similar pool.
    if (usedNames.has(c.nameLower)) continue;
    trySlot({ ...c, source: "tag" });
  }

  // Fallback: fill any remaining slots from either pool (genre guard relaxed).
  if (selected.length < RESULT_COUNT) {
    for (const c of [...similarPool, ...tagPool]) {
      if (selected.length >= RESULT_COUNT) break;
      if (!usedNames.has(c.nameLower)) {
        const source = similarMap.has(c.nameLower) ? "similar" : "tag";
        selected.push({ ...c, source, db: dbByName.get(c.nameLower) });
        usedNames.add(c.nameLower);
      }
    }
  }

  // 8 — Build output.
  const artists: BlindSpotArtist[] = selected.slice(0, RESULT_COUNT).map((s) => ({
    spotifyId: s.db?.id ?? s.nameLower,
    name: s.name,
    imageUrl: s.db?.image_url ?? undefined,
    genres: (s.db?.genres ?? []).slice(0, 3).map((g) => genreLabel(g)),
    becauseOf: s.becauseOf.slice(0, 3),
    source: s.source,
  }));

  return { artists, hasData: artists.length > 0 };
}

// ─── Cache-backed public API ──────────────────────────────────────────────────

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Compute and persist blind spots for a user.
 * Called by the cron job and by `getBlindSpots` on cache miss.
 */
export async function refreshBlindSpots(userId: string): Promise<TasteBlindSpotsResult> {
  const result = await computeBlindSpots(userId);
  if (!result.hasData) return result;

  const admin = createSupabaseAdminClient();
  await admin
    .from("user_blind_spots")
    .upsert(
      { user_id: userId, artists: result.artists, computed_at: new Date().toISOString() },
      { onConflict: "user_id" },
    )
    .throwOnError();

  return result;
}

async function getCachedBlindSpots(userId: string): Promise<TasteBlindSpotsResult> {
  const admin = createSupabaseAdminClient();

  const { data } = await admin
    .from("user_blind_spots")
    .select("artists, computed_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (data) {
    const age = Date.now() - new Date(data.computed_at as string).getTime();
    if (age < CACHE_TTL_MS) {
      const artists = (data.artists ?? []) as BlindSpotArtist[];
      return { artists, hasData: artists.length > 0 };
    }
  }

  return refreshBlindSpots(userId);
}

/** Per-request dedup on top of the DB cache. */
export const getBlindSpots = cache(getCachedBlindSpots);
