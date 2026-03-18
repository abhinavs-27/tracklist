import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getValidSpotifyAccessToken } from "@/lib/spotify-user";
import { syncRecentlyPlayed } from "@/lib/spotify-sync";
import { apiBadRequest, apiInternalError, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ALBUMS = 12;

export type RecentAlbumItem = {
  album_id: string;
  album_name: string | null;
  artist_name: string;
  album_image: string | null;
  last_played_at: string;
};

/** Derive unique recent albums from spotify_recent_tracks (same cache as recent tracks). */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    if (!userId || !isValidUuid(userId)) return apiBadRequest("Valid user_id required");

    const session = await getServerSession(authOptions);
    const supabase = createSupabaseAdminClient();

    const isOwnProfile = session?.user?.id === userId;

    if (isOwnProfile) {
      const { data: lastSyncRow } = await supabase
        .from("spotify_recent_tracks")
        .select("created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const lastSyncAt = lastSyncRow?.created_at ? new Date(lastSyncRow.created_at).getTime() : 0;
      const now = Date.now();
      if (lastSyncAt === 0 || now - lastSyncAt >= CACHE_TTL_MS) {
        try {
          const accessToken = await getValidSpotifyAccessToken(userId);
          await syncRecentlyPlayed(userId, accessToken);
        } catch {
          // Continue with existing cache
        }
      }
    }

    const { data: rows, error } = await supabase
      .from("spotify_recent_tracks")
      .select("album_id, album_name, artist_name, album_image, played_at")
      .eq("user_id", userId)
      .not("album_id", "is", null)
      .order("played_at", { ascending: false })
      .limit(200);

    if (error) return apiInternalError(error);

    const seen = new Set<string>();
    const albums: RecentAlbumItem[] = [];
    for (const row of rows ?? []) {
      const id = row.album_id as string;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      albums.push({
        album_id: id,
        album_name: (row.album_name as string | null) ?? null,
        artist_name: (row.artist_name as string) ?? "",
        album_image: (row.album_image as string | null) ?? null,
        last_played_at: (row.played_at as string) ?? "",
      });
      if (albums.length >= MAX_ALBUMS) break;
    }

    return apiOk({ albums });
  } catch (e) {
    return apiInternalError(e);
  }
}
