import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getRecentlyPlayed } from "@/lib/spotify-user";
import { getOrFetchTracksBatch } from "@/lib/spotify-cache";

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
  album_id: string | null;
  album_name: string | null;
  album_image: string | null;
  played_at: string;
};

/**
 * Fetches recently played from Spotify and upserts passive listens into `logs` (same as manual / Last.fm).
 * Catalog cache is warmed via getOrFetchTracksBatch. Does not write to spotify_recent_tracks.
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
      album_id: album?.id ?? null,
      album_name: album?.name ?? null,
      album_image: albumImage,
      played_at: new Date(item.played_at).toISOString(),
    };
  });

  if (rows.length === 0) {
    return;
  }

  const supabase = createSupabaseAdminClient();

  // Passive listens — same table as every other source
  const passiveLogs = rows.map((r) => ({
    user_id: userId,
    track_id: r.track_id,
    listened_at: r.played_at,
    source: "spotify" as const,
    album_id: r.album_id,
  }));

  const { error: logsError } = await supabase
    .from("logs")
    .upsert(passiveLogs, {
      onConflict: "user_id,track_id,listened_at",
    });

  if (logsError) {
    console.error(
      "spotify-sync: upsert logs passive entries failed",
      logsError,
    );
  } else {
    console.log(
      "[logs] Passive log added: user=%s, songs=%d",
      userId,
      passiveLogs.length,
    );
    // Warm songs cache so feed listen-sessions (logs INNER JOIN songs) show this user's listens
    const trackIds = [...new Set(passiveLogs.map((l) => l.track_id))];
    try {
      await getOrFetchTracksBatch(trackIds);
    } catch (e) {
      console.warn(
        "spotify-sync: cache warm failed (feed may show fewer listens until tracks are loaded):",
        e,
      );
    }
  }

  console.log(
    "spotify-sync: upserted",
    rows.length,
    "recent tracks for user",
    userId,
  );
}
