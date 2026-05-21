import { withHandler } from "@/lib/api-handler";
import { apiInternalError, apiOk } from "@/lib/api-response";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getOrFetchAlbumsBatch,
} from "@/lib/spotify-cache";

const EXPLORE_CATALOG_DB_ONLY = { allowNetwork: false as const };

export const GET = withHandler(
  async (_request, { user }) => {
    const viewerId = user!.id;
    const supabase = createSupabaseAdminClient();

    const { data, error } = await supabase.rpc("get_loved_by_friends", {
      p_viewer_id: viewerId,
      p_entity_type: "album",
      p_limit: 10,
    });

    if (error) {
      return apiInternalError(error);
    }

    const rows = (data ?? []) as {
      entity_id: string;
      entity_type: string;
      avg_friend_rating: number;
      friend_review_count: number;
    }[];

    if (!rows.length) {
      return apiOk({ items: [] });
    }

    const albumIds = rows.map((r) => r.entity_id);
    let albumBatch: (SpotifyApi.AlbumObjectSimplified | null)[] | null = null;
    try {
      albumBatch = (await getOrFetchAlbumsBatch(albumIds, EXPLORE_CATALOG_DB_ONLY)) ?? null;
    } catch {
      albumBatch = null;
    }

    const albumById = new Map(
      (albumBatch ?? [])
        .filter((a): a is SpotifyApi.AlbumObjectSimplified => a != null)
        .map((a) => [a.id, a] as const),
    );

    const items = rows.flatMap((r) => {
      const al = albumById.get(r.entity_id);
      if (!al) return [];
      const artist =
        al.artists?.[0]?.name?.trim() ||
        al.artists?.find((x) => x?.name?.trim())?.name?.trim() ||
        "";
      const img =
        al.images?.find((i) => i?.url?.trim())?.url?.trim() ?? null;
      const rc = Number(r.friend_review_count) || 0;
      const avg = Number(r.avg_friend_rating) || 0;
      return [
        {
          kind: "album" as const,
          id: al.id,
          name: al.name,
          artist,
          image_url: img,
          href: `/album/${al.id}`,
          stat_label: `${avg.toFixed(1)} avg · ${rc} friend${rc === 1 ? "" : "s"}`,
        },
      ];
    });

    return apiOk({ items });
  },
  { requireAuth: true },
);
