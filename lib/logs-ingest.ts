import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getRecentlyPlayed,
  getValidSpotifyAccessToken,
} from "@/lib/spotify-user";
import { upsertTrackFromSpotify } from "@/lib/spotify-cache";

type RecentlyPlayedItem = {
  played_at: string;
  track: SpotifyApi.TrackObjectFull;
};

/**
 * Ingests recently played tracks from Spotify for a single user into:
 * - spotify_recent_tracks (handled elsewhere)
 * - logs (passive song logs; songs only, no ratings/text)
 *
 * Idempotent: logs table enforces UNIQUE(user_id, track_id, listened_at).
 */
export async function ingestRecentPlaysForUser(userId: string): Promise<{
  inserted: number;
  skipped: number;
}> {
  const supabase = createSupabaseAdminClient();

  let accessToken: string;
  try {
    accessToken = await getValidSpotifyAccessToken(userId);
  } catch (e) {
    console.warn("[logs-ingest] user has no valid Spotify token", {
      userId,
      error: e instanceof Error ? e.message : String(e),
    });
    return { inserted: 0, skipped: 0 };
  }

  const data = await getRecentlyPlayed(accessToken, 50);
  const items: RecentlyPlayedItem[] = data.items ?? [];
  if (!items.length) return { inserted: 0, skipped: 0 };

  const candidates = items
    .filter((i) => i.track?.id && i.played_at)
    .map((i) => ({
      track_id: i.track.id,
      listened_at: new Date(i.played_at).toISOString(),
      track: i.track,
    }));

  if (!candidates.length) return { inserted: 0, skipped: 0 };

  // Deduplicate within this batch by (track_id, listened_at)
  const keyToItem = new Map<string, (typeof candidates)[number]>();
  for (const c of candidates) {
    const key = `${c.track_id}:${c.listened_at}`;
    keyToItem.set(key, c);
  }
  const unique = [...keyToItem.values()];

  const { data: existing, error: existingError } = await supabase
    .from("logs")
    .select("track_id, listened_at")
    .eq("user_id", userId)
    .in(
      "track_id",
      unique.map((u) => u.track_id),
    );

  if (existingError) {
    console.error("[logs-ingest] existing logs check failed", existingError);
    return { inserted: 0, skipped: 0 };
  }

  const existingSet = new Set(
    (existing ?? []).map(
      (l: { track_id: string; listened_at: string }) =>
        `${l.track_id}:${new Date(l.listened_at).toISOString()}`,
    ),
  );

  const toInsert = unique.filter(
    (u) =>
      !existingSet.has(`${u.track_id}:${u.listened_at}`),
  );
  if (!toInsert.length) return { inserted: 0, skipped: unique.length };

  // Ensure tracks are present in cache
  for (const item of toInsert) {
    const album = item.track.album;
    const albumId = album?.id ?? item.track.id;
    const albumName = album?.name ?? item.track.name;
    const albumImageUrl = album?.images?.[0]?.url ?? null;

    try {
      await upsertTrackFromSpotify(
        supabase,
        item.track,
        albumId,
        albumName,
        albumImageUrl,
      );
    } catch (e) {
      console.error(
        "[logs-ingest] upsertTrackFromSpotify failed",
        item.track_id,
        e,
      );
    }
  }

  const { error: insertError } = await supabase.from("logs").upsert(
    toInsert.map((u) => ({
      user_id: userId,
      track_id: u.track_id,
      listened_at: u.listened_at,
      source: "spotify",
    })),
    { onConflict: "user_id,track_id,listened_at" },
  );

  if (insertError) {
    console.error("[logs-ingest] insert logs failed", insertError);
    toInsert.forEach((u) => {
      console.log("[spotify-ingest] track ingestion failed", {
        userId,
        trackId: u.track_id,
        success: false,
      });
    });
    return { inserted: 0, skipped: unique.length };
  }

  toInsert.forEach((u) => {
    console.log("[spotify-ingest] track ingestion successful", {
      userId,
      trackId: u.track_id,
      success: true,
    });
  });

  console.log(
    "[logs] Passive log added: user=%s, songs=%d",
    userId,
    toInsert.length,
  );

  return { inserted: toInsert.length, skipped: unique.length - toInsert.length };
}

