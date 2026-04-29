import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  apiBadRequest,
  apiError,
  apiInternalError,
  apiOk,
  apiTooManyRequests,
} from "@/lib/api-response";
import { isSpotifyIntegrationEnabled } from "@/lib/spotify-integration-enabled";
import {
  getRecentlyPlayed,
  getValidSpotifyAccessToken,
} from "@/lib/spotify-user";
import { checkSpotifyRateLimit } from "@/lib/rate-limit";
import { scheduleTrackEnrichmentBatch } from "@/lib/catalog/non-blocking-enrichment";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { scheduleEnrichArtistGenresForTrackIds } from "@/lib/taste/enrich-artist-genres";
import { fanOutListenForUserCommunities } from "@/lib/community/community-feed-insert";
import { bustRecentActivityCacheForUser } from "@/lib/profile/recent-activity-cache";
import type { SyncResponse } from "@/types";

export async function POST(request: NextRequest) {
  if (!checkSpotifyRateLimit(request)) {
    return apiTooManyRequests();
  }
  try {
    const me = await requireApiAuth(request);

    if (!isSpotifyIntegrationEnabled()) {
      return apiError("Spotify account linking is not enabled.", 403, {
        code: "SPOTIFY_LINKING_DISABLED",
      });
    }

    const mode = "song" as const;

    let accessToken: string;
    try {
      accessToken = await getValidSpotifyAccessToken(me.id);
    } catch (e) {
      if (e instanceof Error && e.message === "Spotify not connected")
        return apiBadRequest("Spotify not connected");
      return apiInternalError(e);
    }

    const supabase = await createSupabaseServerClient();
    const recent = await getRecentlyPlayed(accessToken, 50);
    const items = recent.items ?? [];

    const candidates: Array<{ track_id: string; listened_at: string }> = [];

    for (const it of items) {
      const playedAt = it.played_at;
      const track = it.track;
      if (!track?.id || !playedAt) continue;

      candidates.push({ track_id: track.id, listened_at: playedAt });
    }

    if (candidates.length === 0) {
      return apiOk({
        inserted: 0,
        skipped: 0,
        mode,
      } satisfies SyncResponse);
    }

    const keyToItem = new Map<string, (typeof candidates)[number]>();
    for (const c of candidates) {
      const key = c.track_id;
      const prev = keyToItem.get(key);
      if (!prev || Date.parse(c.listened_at) > Date.parse(prev.listened_at))
        keyToItem.set(key, c);
    }
    const unique = [...keyToItem.values()];

    const trackIds = [...new Set(unique.map((u) => u.track_id))];
    const { data: existing, error: existingError } = await supabase
      .from("logs")
      .select("track_id")
      .eq("user_id", me.id)
      .in("track_id", trackIds);
    if (existingError) return apiInternalError(existingError);

    const existingSet = new Set(
      (existing ?? []).map((l: { track_id: string }) => l.track_id),
    );

    const toInsert = unique.filter((u) => !existingSet.has(u.track_id));
    if (toInsert.length === 0) {
      return apiOk({
        inserted: 0,
        skipped: unique.length,
        mode,
      } satisfies SyncResponse);
    }

    const nowIso = new Date().toISOString();
    const { data: insertedLogs, error: insertError } = await supabase
      .from("logs")
      .insert(
        toInsert.map((u) => ({
          user_id: me.id,
          track_id: u.track_id,
          listened_at: new Date(u.listened_at).toISOString(),
          source: "spotify",
          created_at: nowIso,
        })),
      )
      .select("id, track_id, listened_at, source");
    if (insertError) {
      for (const u of toInsert) {
        console.log("[spotify-ingest] ingest", {
          userId: me.id,
          trackId: u.track_id,
          success: false,
        });
      }
      return apiInternalError(insertError);
    }

    for (const u of toInsert) {
      console.log("[spotify-ingest] ingest", {
        userId: me.id,
        trackId: u.track_id,
        success: true,
      });
    }

    const idsToWarm = [...new Set(toInsert.map((u) => u.track_id))];

    await Promise.all([
      (async () => {
        if (insertedLogs?.length) {
          try {
            await Promise.all(
              (
                insertedLogs as {
                  id: string;
                  track_id: string;
                  listened_at: string;
                  source: string;
                }[]
              ).map((row) =>
                fanOutListenForUserCommunities({
                  userId: me.id,
                  logId: row.id,
                  listenedAt: row.listened_at,
                  source: row.source ?? "spotify",
                  trackId: row.track_id,
                }),
              ),
            );
          } catch (e) {
            console.warn("[spotify-sync] community_feed fan-out", e);
          }
        }
      })(),
      (async () => {
        const { grantAchievementsOnListen } = await import("@/lib/queries");
        await grantAchievementsOnListen(me.id);
      })(),
      (async () => {
        // Hydrate catalog in background
        scheduleTrackEnrichmentBatch(idsToWarm);
      })(),
      (async () => {
        try {
          const admin = createSupabaseAdminClient();
          scheduleEnrichArtistGenresForTrackIds(admin, idsToWarm);
        } catch (e) {
          if (process.env.NODE_ENV === "development") {
            console.warn("[spotify-sync] Last.fm genre enrich schedule failed", e);
          }
        }
      })(),
    ]);

    console.log("[spotify-ingest] manual-sync-complete", {
      userId: me.id,
      inserted: toInsert.length,
      skipped: unique.length - toInsert.length,
    });

    bustRecentActivityCacheForUser(me.id);

    return apiOk({
      inserted: toInsert.length,
      skipped: unique.length - toInsert.length,
      mode,
    } satisfies SyncResponse);
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
