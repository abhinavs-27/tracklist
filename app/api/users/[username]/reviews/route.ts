// app/api/users/[username]/reviews/route.ts
import { withHandler } from "@/lib/api-handler";
import { apiNotFound, apiOk } from "@/lib/api-response";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const PAGE_SIZE = 30;

export const GET = withHandler(
  async (request, { user: viewer, params }) => {
    const { username } = await params as { username: string };
    const url = new URL(request.url);
    const filter = url.searchParams.get("filter") ?? "all";
    const yearParam = url.searchParams.get("year");
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));

    const supabase = await createSupabaseServerClient();

    // Resolve user by username
    const { data: profileUser } = await supabase
      .from("users")
      .select("id, lastfm_username")
      .eq("username", username)
      .maybeSingle();

    if (!profileUser) return apiNotFound("User not found");

    const admin = createSupabaseAdminClient();
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = admin
      .from("reviews")
      .select("id, entity_type, entity_id, rating, review_text, created_at")
      .eq("user_id", profileUser.id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (filter === "albums") query = query.eq("entity_type", "album");
    if (filter === "tracks") query = query.eq("entity_type", "song");

    if (yearParam) {
      const y = parseInt(yearParam, 10);
      if (!isNaN(y)) {
        query = query
          .gte("created_at", `${y}-01-01T00:00:00Z`)
          .lt("created_at", `${y + 1}-01-01T00:00:00Z`);
      }
    }

    const { data: reviews, error } = await query;
    if (error) return apiOk({ reviews: [], hasLastfm: false });

    const rows = (reviews ?? []) as Array<{
      id: string;
      entity_type: string;
      entity_id: string;
      rating: number;
      review_text: string | null;
      created_at: string;
    }>;

    if (rows.length === 0) return apiOk({ reviews: [], hasLastfm: !!profileUser.lastfm_username });

    // Enrich album entities
    const albumIds = rows.filter((r) => r.entity_type === "album").map((r) => r.entity_id);
    const trackIds = rows.filter((r) => r.entity_type === "song").map((r) => r.entity_id);

    const [albumsRes, tracksRes] = await Promise.all([
      albumIds.length
        ? admin
            .from("albums")
            .select("id, name, image_url, artist_id")
            .in("id", albumIds)
        : Promise.resolve({ data: [] }),
      trackIds.length
        ? admin
            .from("tracks")
            .select("id, name, album_id, artist_id")
            .in("id", trackIds)
        : Promise.resolve({ data: [] }),
    ]);

    const albumMap = new Map(
      ((albumsRes.data ?? []) as Array<{ id: string; name: string; image_url: string | null; artist_id: string }>)
        .map((a) => [a.id, a]),
    );
    const trackMap = new Map(
      ((tracksRes.data ?? []) as Array<{ id: string; name: string; album_id: string | null; artist_id: string | null }>)
        .map((t) => [t.id, t]),
    );

    // Resolve artist names
    const artistIds = [
      ...new Set([
        ...Array.from(albumMap.values()).map((a) => a.artist_id),
        ...Array.from(trackMap.values()).map((t) => t.artist_id).filter(Boolean),
      ]),
    ] as string[];

    const { data: artistRows } = await admin
      .from("artists")
      .select("id, name")
      .in("id", artistIds);

    const artistMap = new Map(
      ((artistRows ?? []) as Array<{ id: string; name: string }>).map((a) => [a.id, a.name]),
    );

    // Listen counts from aggregates (only for album entries when Last.fm connected)
    const listenCountMap = new Map<string, number>();
    if (profileUser.lastfm_username && albumIds.length > 0) {
      const { data: aggRows } = await admin
        .from("user_listening_aggregates")
        .select("entity_id, count")
        .eq("user_id", profileUser.id)
        .eq("entity_type", "album")
        .in("entity_id", albumIds);

      for (const row of (aggRows ?? []) as Array<{ entity_id: string; count: number }>) {
        listenCountMap.set(
          row.entity_id,
          (listenCountMap.get(row.entity_id) ?? 0) + row.count,
        );
      }
    }

    const enriched = rows.map((r) => {
      if (r.entity_type === "album") {
        const album = albumMap.get(r.entity_id);
        return {
          id: r.id,
          entity_type: "album",
          entity_id: r.entity_id,
          rating: r.rating,
          review_text: r.review_text,
          created_at: r.created_at,
          name: album?.name ?? null,
          image_url: album?.image_url ?? null,
          artist_name: album ? (artistMap.get(album.artist_id) ?? null) : null,
          listen_count: listenCountMap.get(r.entity_id) ?? null,
        };
      }
      const track = trackMap.get(r.entity_id);
      return {
        id: r.id,
        entity_type: "song",
        entity_id: r.entity_id,
        rating: r.rating,
        review_text: r.review_text,
        created_at: r.created_at,
        name: track?.name ?? null,
        image_url: null,
        artist_name: track?.artist_id ? (artistMap.get(track.artist_id) ?? null) : null,
        listen_count: null,
      };
    });

    // Available years (for year picker)
    const { data: yearRows } = await admin
      .from("reviews")
      .select("created_at")
      .eq("user_id", profileUser.id)
      .order("created_at", { ascending: true })
      .limit(1);
    const earliest = (yearRows?.[0] as { created_at: string } | undefined)?.created_at;
    const currentYear = new Date().getFullYear();
    const earliestYear = earliest ? new Date(earliest).getFullYear() : currentYear;
    const availableYears = Array.from(
      { length: currentYear - earliestYear + 1 },
      (_, i) => currentYear - i,
    );

    return apiOk({
      reviews: enriched,
      hasLastfm: !!profileUser.lastfm_username,
      availableYears,
    });
  },
  { requireAuth: false },
);
