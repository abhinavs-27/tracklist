import { Router } from "express";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import { isValidUuid } from "../lib/validation";

const MAX_ALBUMS = 12;

/**
 * GET /api/recent-albums?user_id= — recent unique albums from `spotify_recent_tracks`.
 * Does not run Spotify sync (Next.js route may); mobile still gets cached rows.
 */
export const recentAlbumsRouter = Router();

recentAlbumsRouter.get("/", async (req, res, next) => {
  try {
    const userId = typeof req.query.user_id === "string" ? req.query.user_id : "";
    if (!userId || !isValidUuid(userId)) {
      res.status(400).json({ error: "Valid user_id required" });
      return;
    }
    if (!isSupabaseConfigured()) {
      res.status(500).json({ error: "Server misconfigured" });
      return;
    }

    const supabase = getSupabase();
    const { data: rows, error } = await supabase
      .from("spotify_recent_tracks")
      .select("album_id, album_name, artist_name, album_image, played_at")
      .eq("user_id", userId)
      .not("album_id", "is", null)
      .order("played_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("[recent-albums]", error);
      res.status(500).json({ error: "Failed to load recent albums" });
      return;
    }

    const seen = new Set<string>();
    const albums: Array<{
      album_id: string;
      album_name: string | null;
      artist_name: string;
      album_image: string | null;
      last_played_at: string;
    }> = [];

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

    res.status(200).json({ albums });
  } catch (e) {
    next(e);
  }
});
