/**
 * Shared user-directory logic for **Next.js API routes** and the **Express** backend
 * (`/api/search/users/browse`, `/api/search/users/taste-overlap`). Pass a Supabase client:
 * Next typically uses cookie SSR or service role; Express uses `getSupabase()` (service role).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type TasteOverlapSuggestion = {
  id: string;
  username: string;
  avatar_url: string | null;
  followers_count: number;
  reasons: string[];
  score: number;
};

const LOG_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const LOG_FETCH_LIMIT = 15_000;
const DEFAULT_SUGGESTION_LIMIT = 10;
const MAX_REASON_LINES = 3;

/** Oldest signups first (browse directory). Uses `list_users_by_created` RPC when available. */
export async function listUsersByCreatedAtWithClient(
  supabase: SupabaseClient,
  limit = 10,
  offset = 0,
  excludeUserId: string | null = null,
): Promise<
  {
    id: string;
    username: string;
    avatar_url: string | null;
    followers_count: number;
  }[]
> {
  try {
    const cappedLimit = Math.min(Math.max(1, limit), 50);
    const safeOffset = Math.max(0, offset);
    const { data, error } = await supabase.rpc("list_users_by_created", {
      p_limit: cappedLimit,
      p_offset: safeOffset,
      p_exclude_user_id: excludeUserId || null,
    });
    if (!error && Array.isArray(data)) {
      return (
        data as {
          id: string;
          username: string;
          avatar_url: string | null;
          followers_count: number;
        }[]
      ).map((r) => ({
        id: r.id,
        username: r.username,
        avatar_url: r.avatar_url ?? null,
        followers_count: Number(r.followers_count) || 0,
      }));
    }
    if (error) {
      console.warn(
        "[user-search-directory] list_users_by_created RPC failed, using fallback:",
        error.message,
      );
    }
    let q = supabase
      .from("users")
      .select("id, username, avatar_url")
      .order("created_at", { ascending: true })
      .range(safeOffset, safeOffset + cappedLimit - 1);
    if (excludeUserId) q = q.neq("id", excludeUserId);
    const { data: rows, error: qerr } = await q;
    if (qerr) throw qerr;
    return (rows ?? []).map((u) => ({
      id: u.id,
      username: u.username,
      avatar_url: u.avatar_url ?? null,
      followers_count: 0,
    }));
  } catch (e) {
    console.error("[user-search-directory] listUsersByCreatedAtWithClient failed:", e);
    return [];
  }
}

export async function artistIdsFromAlbumIds(
  admin: SupabaseClient,
  albumIds: string[],
): Promise<string[]> {
  if (albumIds.length === 0) return [];
  const { data, error } = await admin
    .from("albums")
    .select("artist_id")
    .in("id", albumIds);
  if (error) {
    console.warn("[taste-overlap] albums artist_id lookup failed", error);
    return [];
  }
  return [
    ...new Set(
      (data ?? [])
        .map((r) => (r as { artist_id: string | null }).artist_id)
        .filter((x): x is string => Boolean(x)),
    ),
  ];
}

type PerUserBucket = {
  albumCounts: Map<string, number>;
  artistCounts: Map<string, number>;
  score: number;
};

function buildOrFilter(albumIds: string[], artistIds: string[]): string | null {
  const parts: string[] = [];
  if (albumIds.length > 0) {
    parts.push(`album_id.in.(${albumIds.join(",")})`);
  }
  if (artistIds.length > 0) {
    parts.push(`artist_id.in.(${artistIds.join(",")})`);
  }
  if (parts.length === 0) return null;
  return parts.join(",");
}

async function followersCountByUserId(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (userIds.length === 0) return out;
  const { data, error } = await admin
    .from("follows")
    .select("following_id")
    .in("following_id", userIds);
  if (error) {
    console.warn("[taste-overlap] follows count query failed", error);
    return out;
  }
  for (const row of data ?? []) {
    const id = (row as { following_id: string }).following_id;
    out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/**
 * Taste overlap suggestions (same behavior as legacy onboarding module); inject any
 * service-role or SSR Supabase client.
 */
export async function getTasteOverlapSuggestionsForViewerWithClient(
  admin: SupabaseClient,
  viewerId: string,
  options?: { limit?: number },
): Promise<TasteOverlapSuggestion[]> {
  const limit = Math.min(
    Math.max(1, options?.limit ?? DEFAULT_SUGGESTION_LIMIT),
    50,
  );

  const { data: favRows, error: favErr } = await admin
    .from("user_favorite_albums")
    .select("album_id")
    .eq("user_id", viewerId)
    .order("position", { ascending: true });
  if (favErr) {
    console.warn("[taste-overlap] favorite albums failed", favErr);
    return [];
  }
  const albumIds = (favRows ?? []).map(
    (r) => (r as { album_id: string }).album_id,
  );
  if (albumIds.length === 0) return [];

  const artistIds = await artistIdsFromAlbumIds(admin, albumIds);
  const favAlbumSet = new Set(albumIds);
  const favArtistSet = new Set(artistIds);

  const orFilter = buildOrFilter(albumIds, artistIds);
  if (!orFilter) return [];

  const since = new Date(Date.now() - LOG_LOOKBACK_MS).toISOString();
  const { data: logRows, error: logErr } = await admin
    .from("logs")
    .select("user_id, album_id, artist_id")
    .neq("user_id", viewerId)
    .gte("listened_at", since)
    .or(orFilter)
    .limit(LOG_FETCH_LIMIT);

  if (logErr) {
    console.warn("[taste-overlap] logs query failed", logErr);
    return [];
  }

  const byUser = new Map<string, PerUserBucket>();

  for (const raw of logRows ?? []) {
    const row = raw as {
      user_id: string;
      album_id: string | null;
      artist_id: string | null;
    };
    const uid = row.user_id;
    let bucket = byUser.get(uid);
    if (!bucket) {
      bucket = {
        albumCounts: new Map(),
        artistCounts: new Map(),
        score: 0,
      };
      byUser.set(uid, bucket);
    }
    bucket.score += 1;

    const aid = row.album_id;
    const arid = row.artist_id;
    if (aid && favAlbumSet.has(aid)) {
      bucket.albumCounts.set(aid, (bucket.albumCounts.get(aid) ?? 0) + 1);
      continue;
    }
    if (arid && favArtistSet.has(arid)) {
      bucket.artistCounts.set(arid, (bucket.artistCounts.get(arid) ?? 0) + 1);
    }
  }

  const ranked = [...byUser.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit);

  if (ranked.length === 0) return [];

  const suggestedIds = ranked.map(([id]) => id);

  const allAlbumKeys = new Set<string>();
  const allArtistKeys = new Set<string>();
  for (const [, bucket] of ranked) {
    for (const id of bucket.albumCounts.keys()) allAlbumKeys.add(id);
    for (const id of bucket.artistCounts.keys()) allArtistKeys.add(id);
  }

  const [albumMeta, artistMeta, userRows] = await Promise.all([
    allAlbumKeys.size
      ? admin.from("albums").select("id, name").in("id", [...allAlbumKeys])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    allArtistKeys.size
      ? admin.from("artists").select("id, name").in("id", [...allArtistKeys])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    admin
      .from("users")
      .select("id, username, avatar_url")
      .in("id", suggestedIds),
  ]);

  const albumNameById = new Map(
    (albumMeta.data ?? []).map((r) => {
      const row = r as { id: string; name: string };
      return [row.id, row.name] as const;
    }),
  );
  const artistNameById = new Map(
    (artistMeta.data ?? []).map((r) => {
      const row = r as { id: string; name: string };
      return [row.id, row.name] as const;
    }),
  );

  const userById = new Map(
    (
      (userRows.data ?? []) as {
        id: string;
        username: string;
        avatar_url: string | null;
      }[]
    ).map((u) => [u.id, u] as const),
  );

  const followerMap = await followersCountByUserId(admin, suggestedIds);

  const results: TasteOverlapSuggestion[] = [];

  for (const [uid, bucket] of ranked) {
    const profile = userById.get(uid);
    const reasons: string[] = [];

    const albumEntries = [...bucket.albumCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    );
    const artistEntries = [...bucket.artistCounts.entries()].sort(
      (a, b) => b[1] - a[1],
    );

    for (const [albumId] of albumEntries) {
      if (reasons.length >= MAX_REASON_LINES) break;
      const name = albumNameById.get(albumId)?.trim() || "an album";
      reasons.push(
        `Recently logged listens from “${name}” — one of your favorite albums`,
      );
    }
    for (const [artistId] of artistEntries) {
      if (reasons.length >= MAX_REASON_LINES) break;
      const name = artistNameById.get(artistId)?.trim() || "this artist";
      reasons.push(
        `Recently logged music by “${name}” — an artist from your favorite albums`,
      );
    }

    if (reasons.length === 0) {
      reasons.push("Overlapping recent listens with your favorite albums");
    }

    results.push({
      id: uid,
      username: profile?.username ?? "listener",
      avatar_url: profile?.avatar_url ?? null,
      followers_count: followerMap.get(uid) ?? 0,
      reasons,
      score: bucket.score,
    });
  }

  return results;
}
