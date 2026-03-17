import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseServerClient } from "@/lib/supabase";
import {
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
  apiOk,
  apiTooManyRequests,
} from "@/lib/api-response";
import {
  getRecentlyPlayed,
  getValidSpotifyAccessToken,
} from "@/lib/spotify-user";
import { checkSpotifyRateLimit } from "@/lib/rate-limit";
import { getOrFetchTracksBatch } from "@/lib/spotify-cache";

type SyncResponse = {
  inserted: number;
  skipped: number;
  mode: "song";
};

export async function POST(request: NextRequest) {
  if (!checkSpotifyRateLimit(request)) {
    return apiTooManyRequests();
  }
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const mode = "song" as const;

    let accessToken: string;
    try {
      accessToken = await getValidSpotifyAccessToken(session.user.id);
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
      .eq("user_id", session.user.id)
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
    const { error: insertError } = await supabase.from("logs").insert(
      toInsert.map((u) => ({
        user_id: session.user.id,
        track_id: u.track_id,
        listened_at: new Date(u.listened_at).toISOString(),
        source: "spotify",
        created_at: nowIso,
      })),
    );
    if (insertError) {
      toInsert.forEach((u) => {
        console.log("[spotify-ingest] track ingestion failed", {
          userId: session.user.id,
          trackId: u.track_id,
          success: false,
        });
      });
      return apiInternalError(insertError);
    }

    toInsert.forEach((u) => {
      console.log("[spotify-ingest] track ingestion successful", {
        userId: session.user.id,
        trackId: u.track_id,
        success: true,
      });
    });

    const { grantAchievementsOnListen } = await import("@/lib/queries");
    await grantAchievementsOnListen(session.user.id);

    // Warm songs/albums cache so feed listen-sessions RPC can join logs → songs and show sessions
    const idsToWarm = [...new Set(toInsert.map((u) => u.track_id))];
    try {
      await getOrFetchTracksBatch(idsToWarm);
    } catch (e) {
      console.warn("[spotify-ingest] cache warm failed (feed listen sessions may be empty until tracks are loaded):", e);
    }

    console.log("[spotify-ingest] spotify sync complete", {
      userId: session.user.id,
      inserted: toInsert.length,
      skipped: unique.length - toInsert.length,
    });

    return apiOk({
      inserted: toInsert.length,
      skipped: unique.length - toInsert.length,
      mode,
    } satisfies SyncResponse);
  } catch (e) {
    return apiInternalError(e);
  }
}
