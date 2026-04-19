import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAlbum, getArtist, getTrack } from "@/lib/spotify";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getAlbumIdByExternalId,
  getArtistIdByExternalId,
  getTrackIdByExternalId,
} from "@/lib/catalog/entity-resolution";
import {
  upsertAlbumFromSpotify,
  upsertArtistFromSpotify,
  upsertTrackFromSpotify,
} from "@/lib/spotify-cache";
import { firstSpotifyImageUrl } from "@/lib/spotify/best-image-url";
import { spotifyResolverNetworkTimeoutMs } from "@/lib/catalog/spotify-resolver-timeout";
import { isValidSpotifyId } from "@/lib/validation";

export type CatalogEntityType = "album" | "track" | "artist";

export class GetOrCreateEntityError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "INVALID_SPOTIFY_ID"
      | "OFFLINE_NO_ROW"
      | "ENSURE_FAILED",
  ) {
    super(message);
    this.name = "GetOrCreateEntityError";
  }
}

const MAX_CACHE = 5000;
const cacheOrder: string[] = [];
const mem = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  return mem.get(key);
}

function cacheSet(key: string, uuid: string): void {
  if (mem.has(key)) {
    mem.set(key, uuid);
    return;
  }
  while (mem.size >= MAX_CACHE && cacheOrder.length > 0) {
    const oldest = cacheOrder.shift();
    if (oldest) mem.delete(oldest);
  }
  mem.set(key, uuid);
  cacheOrder.push(key);
}

function cacheKey(type: CatalogEntityType, spotifyId: string): string {
  return `spotify:${type}:${spotifyId}`;
}

export type GetOrCreateEntityInput = {
  type: CatalogEntityType;
  spotifyId: string;
  allowNetwork?: boolean;
};

/**
 * Hard timeout: rejects with `new Error("TIMEOUT")` so callers can match on `message`.
 * Used for Spotify GETs and route-level full resolver (see `spotify-resolver-timeout.ts`).
 */
export async function withTimeout<T>(promise: Promise<T>, ms = 5000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), ms),
    ),
  ]);
}

async function resolveAlbumNetwork(
  admin: SupabaseClient,
  raw: string,
): Promise<string> {
  const existing2 = await getAlbumIdByExternalId(admin, "spotify", raw);
  if (existing2) {
    return existing2;
  }
  console.log("[Resolver] fetching from Spotify");
  const albumResp = await withTimeout(
    getAlbum(raw, { skipCache: true }),
    spotifyResolverNetworkTimeoutMs(),
  );
  console.log("[Resolver] Spotify response received");
  return upsertAlbumFromSpotify(admin, albumResp, { resolverTrace: true });
}

async function resolveTrackNetwork(
  admin: SupabaseClient,
  raw: string,
): Promise<string> {
  const existing2 = await getTrackIdByExternalId(admin, "spotify", raw);
  if (existing2) {
    return existing2;
  }
  console.log("[Resolver] fetching from Spotify");
  const track = await withTimeout(getTrack(raw), spotifyResolverNetworkTimeoutMs());
  console.log("[Resolver] Spotify response received");
  const alb = track.album;
  if (!alb) {
    throw new Error("ensureSpotifyTrackInCatalog: track has no album");
  }
  await upsertTrackFromSpotify(
    admin,
    track,
    alb.id,
    alb.name,
    firstSpotifyImageUrl(alb.images),
    "release_date" in alb ? alb.release_date : undefined,
    { resolverTrace: true },
  );
  const uuid = await getTrackIdByExternalId(admin, "spotify", raw);
  if (!uuid) {
    throw new Error(
      `ensureSpotifyTrackInCatalog: missing mapping after upsert for ${raw}`,
    );
  }
  return uuid;
}

async function resolveArtistNetwork(
  admin: SupabaseClient,
  raw: string,
): Promise<string> {
  const existing2 = await getArtistIdByExternalId(admin, "spotify", raw);
  if (existing2) {
    return existing2;
  }
  console.log("[Resolver] fetching from Spotify");
  const artist = await withTimeout(getArtist(raw), spotifyResolverNetworkTimeoutMs());
  console.log("[Resolver] Spotify response received");
  return upsertArtistFromSpotify(admin, artist, { resolverTrace: true });
}

/**
 * Resolve a Spotify catalog id to internal `albums.id` / `tracks.id` / `artists.id`.
 * - Memory cache → DB `*_external_ids` → (optional) Spotify ensure + upsert.
 * DB already enforces UNIQUE (source, external_id); link helpers tolerate races (23505).
 */
export async function getOrCreateEntity(
  input: GetOrCreateEntityInput,
): Promise<{ id: string }> {
  const allowNetwork = input.allowNetwork !== false;
  const raw = input.spotifyId.trim();
  if (!isValidSpotifyId(raw)) {
    throw new GetOrCreateEntityError(
      "spotifyId must be a Spotify base62 id",
      "INVALID_SPOTIFY_ID",
    );
  }

  console.log("[Resolver] start", { type: input.type, spotifyId: raw });

  const key = cacheKey(input.type, raw);
  const cached = cacheGet(key);
  if (cached) {
    console.log("[Resolver] done", { id: cached });
    return { id: cached };
  }

  const admin = createSupabaseAdminClient();

  console.log("[Resolver] checking external_ids");
  const dbHit =
    input.type === "album"
      ? await getAlbumIdByExternalId(admin, "spotify", raw)
      : input.type === "track"
        ? await getTrackIdByExternalId(admin, "spotify", raw)
        : await getArtistIdByExternalId(admin, "spotify", raw);

  console.log("[Resolver] external_ids result:", dbHit ?? null);

  if (dbHit) {
    cacheSet(key, dbHit);
    console.log("[Resolver] done", { id: dbHit });
    return { id: dbHit };
  }

  if (!allowNetwork) {
    throw new GetOrCreateEntityError(
      "No catalog row and allowNetwork is false",
      "OFFLINE_NO_ROW",
    );
  }

  let created: string;
  try {
    created =
      input.type === "album"
        ? await resolveAlbumNetwork(admin, raw)
        : input.type === "track"
          ? await resolveTrackNetwork(admin, raw)
          : await resolveArtistNetwork(admin, raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Resolver ERROR]", e);
    throw new GetOrCreateEntityError(
      `ensure failed: ${msg}`,
      "ENSURE_FAILED",
    );
  }

  console.log("[Resolver] done", { id: created });
  cacheSet(key, created);
  return { id: created };
}

/** Optional multi-source resolver (Spotify preferred when present). */
export async function resolveEntityExternalIds(input: {
  type: CatalogEntityType;
  externalIds: { spotify?: string; lastfm?: string };
  allowNetwork?: boolean;
}): Promise<{ id: string } | null> {
  const allowNetwork = input.allowNetwork !== false;
  const spotify = input.externalIds.spotify?.trim();
  if (spotify && isValidSpotifyId(spotify)) {
    return getOrCreateEntity({
      type: input.type,
      spotifyId: spotify,
      allowNetwork,
    });
  }
  return null;
}
