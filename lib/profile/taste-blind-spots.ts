import "server-only";

import { cache } from "react";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { fetchLastfmApi } from "@/lib/lastfm/lastfm-api-fetch";

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlindSpotArtist = {
  spotifyId: string;
  name: string;
  imageUrl?: string;
  genres: string[];
  becauseOf: string[]; // names of the user's own top artists that relate to this one
};

export type TasteBlindSpotsResult = {
  artists: BlindSpotArtist[];
  hasData: boolean;
};

// ─── Last.fm similar artists ──────────────────────────────────────────────────

type LastfmSimilarArtist = { name: string; mbid?: string };

async function fetchSimilarArtists(artistName: string): Promise<LastfmSimilarArtist[]> {
  const apiKey = process.env.LASTFM_API_KEY?.trim();
  if (!apiKey) return [];
  try {
    const url = new URL("https://ws.audioscrobbler.com/2.0/");
    url.searchParams.set("method", "artist.getSimilar");
    url.searchParams.set("artist", artistName);
    url.searchParams.set("limit", "20");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    const res = await fetchLastfmApi(url, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      similarartists?: { artist?: LastfmSimilarArtist[] };
    };
    return data.similarartists?.artist ?? [];
  } catch (e) {
    console.warn(`    fetchSimilarArtists("${artistName}") failed:`, e instanceof Error ? e.message : String(e));
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

  // 1 — Collect all played artist names + pick top seeds from recent snapshots.
  console.log(`  [${short}] fetching snapshots...`);
  const { data: snapshots, error: snapErr } = await admin
    .from("taste_snapshots")
    .select("snapshot_month, top_artists")
    .eq("user_id", userId)
    .order("snapshot_month", { ascending: false });

  if (snapErr || !snapshots || snapshots.length === 0) return EMPTY;

  type ArtistEntry = { id: string; name: string; plays: number };
  type Snapshot = { snapshot_month: string; top_artists: ArtistEntry[] };

  // Seeds come from recent snapshots (top artists per month, already have names).
  const recentTopByName = new Map<string, ArtistEntry>();
  for (const snap of snapshots as Snapshot[]) {
    for (const a of snap.top_artists ?? []) {
      const key = a.name.toLowerCase().trim();
      if (!recentTopByName.has(key)) recentTopByName.set(key, a);
    }
  }

  if (recentTopByName.size === 0) return EMPTY;

  // Build the complete played-names filter from user_listening_aggregates so that
  // artists the user has listened to but never cracked their monthly top 10 are
  // still excluded from recommendations.
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

  // Look up names for IDs found in aggregates (in 500-item chunks).
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

  const seedArtists = [...recentTopByName.values()].slice(0, 6);
  console.log(`  [${short}] ${seedArtists.length} seeds — fetching similar...`);

  // 2 — Fetch Last.fm similar artists for each seed.
  type Candidate = { name: string; becauseOf: string[]; score: number };
  const candidates = new Map<string, Candidate>(); // key = normalised name

  for (const seed of seedArtists) {
    console.log(`  [${short}] → similar artists for "${seed.name}"...`);
    const similar = await fetchSimilarArtists(seed.name);
    for (const s of similar) {
      const key = s.name.toLowerCase().trim();
      if (playedNames.has(key)) continue; // already in their rotation
      const existing = candidates.get(key);
      if (existing) {
        existing.becauseOf.push(seed.name);
        existing.score++;
      } else {
        candidates.set(key, { name: s.name, becauseOf: [seed.name], score: 1 });
      }
    }
  }

  if (candidates.size === 0) return EMPTY;

  // 3 — Rank by connection count, take top 6.
  const topNames = [...candidates.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((c) => ({ ...c, nameLower: c.name.toLowerCase().trim() }));

  // 4 — Look up artist metadata (image, spotify ID) from our DB for display.
  const { data: artistRows } = await admin
    .from("artists")
    .select("id, name, image_url")
    .in(
      "name_normalized",
      topNames.map((t) => t.nameLower),
    );

  const dbByName = new Map(
    (artistRows ?? []).map((r) => [
      (r.name as string).toLowerCase().trim(),
      r as { id: string; name: string; image_url: string | null },
    ]),
  );

  const artists: BlindSpotArtist[] = topNames.map((c) => {
    const db = dbByName.get(c.nameLower);
    return {
      spotifyId: db?.id ?? c.nameLower, // fall back to internal UUID or name as href key
      name: c.name,
      imageUrl: db?.image_url ?? undefined,
      genres: [],
      becauseOf: c.becauseOf.slice(0, 3),
    };
  });

  return { artists, hasData: true };
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

  // Cache miss or stale — compute and store (background-safe, first-load acceptable)
  return refreshBlindSpots(userId);
}

/** Per-request dedup on top of the DB cache. */
export const getBlindSpots = cache(getCachedBlindSpots);
