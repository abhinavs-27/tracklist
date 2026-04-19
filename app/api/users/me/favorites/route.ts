import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { getOrCreateEntity } from "@/lib/catalog/getOrCreateEntity";
import { resolveCanonicalAlbumUuidFromEntityId } from "@/lib/catalog/entity-resolution";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  apiBadRequest,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { getUserFavoriteAlbums } from "@/lib/queries";
import { isValidSpotifyId, isValidUuid } from "@/lib/validation";
import type { SupabaseServerClient } from "@/lib/supabase-server";

type Body = {
  albums?: unknown;
};

/**
 * Album picker sends Spotify base62 ids from `/api/search`; `user_favorite_albums.album_id` is `albums.id` (UUID).
 */
async function resolveFavoriteAlbumUuid(
  supabase: SupabaseServerClient,
  raw: string,
): Promise<string | null> {
  const id = raw.trim();
  if (!id) return null;

  let uuid = await resolveCanonicalAlbumUuidFromEntityId(supabase, id);
  if (uuid) return uuid;

  if (isValidSpotifyId(id)) {
    try {
      const r = await getOrCreateEntity({
        type: "album",
        spotifyId: id,
        allowNetwork: true,
      });
      return r.id;
    } catch (e) {
      console.error("[users/me/favorites] getOrCreateEntity album", id, e);
      return null;
    }
  }

  if (isValidUuid(id)) {
    const { data } = await supabase
      .from("albums")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);
    const albums = await getUserFavoriteAlbums(me.id);
    return apiOk({
      albums: albums.map((a) => ({
        album_id: a.album_id,
        name: a.name,
        image_url: a.image_url,
      })),
    });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);

    const { data: body, error: parseErr } = await parseBody<Body>(request);
    if (parseErr) return parseErr;

    const raw = Array.isArray(body!.albums) ? body!.albums : [];
    const rawIds = raw
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((id) => id.length > 0)
      .slice(0, 4);

    const supabase = await createSupabaseServerClient();

    const resolved = await Promise.all(
      rawIds.map((r) => resolveFavoriteAlbumUuid(supabase, r)),
    );
    const albumIds: string[] = [];
    const seen = new Set<string>();
    for (const canon of resolved) {
      if (!canon) {
        return apiBadRequest(
          "Could not resolve one or more albums. Try picking the album again.",
        );
      }
      if (seen.has(canon)) continue;
      seen.add(canon);
      albumIds.push(canon);
    }

    // Clear existing favorites for user, then insert new ones.
    const { error: deleteError } = await supabase
      .from("user_favorite_albums")
      .delete()
      .eq("user_id", me.id);
    if (deleteError) return apiInternalError(deleteError);

    if (albumIds.length > 0) {
      const rows = albumIds.map((id, index) => ({
        user_id: me.id,
        album_id: id,
        position: index + 1,
      }));
      const { error: insertError } = await supabase
        .from("user_favorite_albums")
        .insert(rows);
      if (insertError) return apiInternalError(insertError);
    }

    console.log("[users] favorites-updated", {
      userId: me.id,
      albumIds,
    });

    const admin = createSupabaseAdminClient();
    const { error: syncErr } = await admin.rpc(
      "sync_favorite_counts_from_user_favorite_albums",
    );
    if (syncErr) {
      console.error("[users] sync_favorite_counts_from_user_favorite_albums", syncErr);
    }

    return apiOk({ albums: albumIds });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}

