import { createSupabaseServerClient } from "@/lib/supabase-server";

export type ExploreReviewPreviewRow = {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  /** Canonical album id (same as `albums.id`). */
  entity_id: string;
  album_name: string;
  artist_name: string;
  rating: number;
  created_at: string;
};

export type ExploreReviewsPayload = {
  reviews: ExploreReviewPreviewRow[];
};

/**
 * Recent album reviews for the Explore hub (global feed).
 */
export async function getExploreRecentAlbumReviews(
  limit = 8,
): Promise<ExploreReviewsPayload> {
  const cap = Math.min(Math.max(1, limit), 20);
  try {
    const supabase = await createSupabaseServerClient();

    const { data: rows, error } = await supabase
      .from("reviews")
      .select("id, user_id, entity_id, rating, created_at")
      .eq("entity_type", "album")
      .order("created_at", { ascending: false })
      .limit(cap);

    if (error || !rows?.length) {
      return { reviews: [] };
    }

    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const albumIds = [...new Set(rows.map((r) => r.entity_id as string))];

    const [usersRes, albumsRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, username, avatar_url")
        .in("id", userIds),
      supabase
        .from("albums")
        .select("id, name, artist_id")
        .in("id", albumIds),
    ]);

    if (usersRes.error || albumsRes.error) {
      return { reviews: [] };
    }

    const userMap = new Map(
      (usersRes.data ?? []).map((u) => [
        u.id,
        {
          username: u.username ?? "Unknown",
          avatar_url: u.avatar_url ?? null,
        },
      ]),
    );

    const albumRows = (albumsRes.data ?? []) as {
      id: string;
      name: string;
      artist_id: string;
    }[];
    const albumMap = new Map(albumRows.map((a) => [a.id, a]));
    const artistIds = [...new Set(albumRows.map((a) => a.artist_id))];

    const { data: artistRows } = await supabase
      .from("artists")
      .select("id, name")
      .in("id", artistIds);

    const artistMap = new Map(
      (artistRows ?? []).map((a) => [a.id, a.name ?? "Unknown"]),
    );

    const reviews: ExploreReviewPreviewRow[] = [];
    for (const r of rows) {
      const album = albumMap.get(r.entity_id as string);
      const u = userMap.get(r.user_id);
      if (!album || !u) continue;
      reviews.push({
        id: r.id,
        user_id: r.user_id,
        username: u.username,
        avatar_url: u.avatar_url,
        entity_id: album.id,
        album_name: album.name,
        artist_name: artistMap.get(album.artist_id) ?? "Unknown",
        rating: Number(r.rating),
        created_at: r.created_at,
      });
      if (reviews.length >= cap) break;
    }

    return { reviews };
  } catch (e) {
    console.warn("[explore-reviews-preview]", e);
    return { reviews: [] };
  }
}
