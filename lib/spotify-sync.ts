import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getRecentlyPlayed } from "@/lib/spotify-user";

/** Spotify recently-played item with track.artists (API returns this; our export type is minimal). */
type RecentlyPlayedItem = {
  played_at: string;
  track: {
    id: string;
    name: string;
    album?: { id: string; name: string; images?: { url: string }[] };
    artists?: { name: string }[];
  };
};

export type RecentTrackRow = {
  user_id: string;
  track_id: string;
  track_name: string;
  artist_name: string;
  album_name: string | null;
  album_image: string | null;
  played_at: string;
};

/**
 * Fetches recently played from Spotify, maps to DB rows, and upserts into spotify_recent_tracks.
 * Uses (user_id, track_id, played_at) as uniqueness key. Caller must use admin client for RLS.
 */
export async function syncRecentlyPlayed(
  userId: string,
  accessToken: string,
): Promise<void> {
  const data = await getRecentlyPlayed(accessToken, 50);
  const items = (data.items ?? []) as RecentlyPlayedItem[];

  const rows: RecentTrackRow[] = items.map((item) => {
    const track = item.track;
    const artists = track.artists ?? [];
    const artistName = artists.map((a) => a.name).join(", ") || "Unknown";
    const album = track.album;
    const albumImage = album?.images?.[0]?.url ?? null;

    return {
      user_id: userId,
      track_id: track.id,
      track_name: track.name ?? "",
      artist_name: artistName,
      album_name: album?.name ?? null,
      album_image: albumImage,
      played_at: new Date(item.played_at).toISOString(),
    };
  });

  if (rows.length === 0) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("spotify_recent_tracks").upsert(rows, {
    onConflict: "user_id,track_id,played_at",
  });

  if (error) {
    console.error("spotify-sync: upsert spotify_recent_tracks failed", error);
    throw error;
  }
  console.log("spotify-sync: upserted", rows.length, "recent tracks for user", userId);
}
