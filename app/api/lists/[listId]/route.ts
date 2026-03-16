import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getList, getListOwnerId } from "@/lib/queries";
import { getOrFetchAlbum } from "@/lib/spotify-cache";
import { getOrFetchTrack } from "@/lib/spotify-cache";
import {
  apiNotFound,
  apiInternalError,
  apiUnauthorized,
  apiForbidden,
  apiBadRequest,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import {
  isValidUuid,
  validateListTitle,
  validateListDescription,
} from "@/lib/validation";

export type ListItemEnriched = {
  id: string;
  list_id: string;
  entity_type: "album" | "song";
  entity_id: string;
  position: number;
  added_at: string;
  album?: SpotifyApi.AlbumObjectSimplified | SpotifyApi.AlbumObjectFull;
  track?: SpotifyApi.TrackObjectSimplified | SpotifyApi.TrackObjectFull;
};

/** GET – list details + ordered items with album/song info. Public. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    if (!isValidUuid(listId)) return apiNotFound("List not found");

    const data = await getList(listId);
    if (!data) return apiNotFound("List not found");

    const enriched: ListItemEnriched[] = [];
    for (const item of data.items) {
      try {
        if (item.entity_type === "album") {
          const { album } = await getOrFetchAlbum(item.entity_id);
          enriched.push({
            ...item,
            album: album as SpotifyApi.AlbumObjectSimplified,
          });
        } else {
          const track = await getOrFetchTrack(item.entity_id);
          enriched.push({ ...item, track });
        }
      } catch (e) {
        console.warn(`[lists] Failed to fetch ${item.entity_type} ${item.entity_id}:`, e);
        enriched.push({ ...item });
      }
    }

    return apiOk({
      list: data.list,
      owner_username: data.owner_username,
      items: enriched,
    });
  } catch (e) {
    return apiInternalError(e);
  }
}

/** PATCH – update list metadata (title, description, visibility, emoji/image). Auth + ownership required. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  try {
    const { listId } = await params;
    if (!isValidUuid(listId)) return apiNotFound("List not found");

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const ownerId = await getListOwnerId(listId);
    if (!ownerId || ownerId !== session.user.id) {
      return apiForbidden("You do not own this list");
    }

    const { data: body, error: parseErr } = await parseBody<{
      title?: unknown;
      description?: unknown;
      visibility?: unknown;
      emoji?: unknown;
      image_url?: unknown;
    }>(request);
    if (parseErr) return parseErr;

    const updates: Record<string, unknown> = {};

    if (body!.title !== undefined) {
      const titleResult = validateListTitle(body.title);
      if (!titleResult.ok) return apiBadRequest(titleResult.error);
      updates.title = titleResult.value;
    }
    if (body.description !== undefined) {
      updates.description = validateListDescription(body.description);
    }
    if (body.visibility !== undefined) {
      const v = body.visibility;
      if (v !== "public" && v !== "friends" && v !== "private") {
        return apiBadRequest("Invalid visibility");
      }
      updates.visibility = v;
    }
    if (body.image_url !== undefined) {
      updates.image_url =
        typeof body.image_url === "string" && body.image_url.length > 0
          ? body.image_url
          : null;
    }

    if (Object.keys(updates).length === 0) {
      return apiBadRequest("No fields to update");
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("lists")
      .update(updates)
      .eq("id", listId)
      .select(
        "id, user_id, title, description, type, visibility, emoji, image_url, created_at",
      )
      .maybeSingle();

    if (error || !data) return apiInternalError(error ?? new Error("Update failed"));
    return apiOk(data);
  } catch (e) {
    return apiInternalError(e);
  }
}

/** DELETE – delete a list (and its items via CASCADE). Auth + ownership required. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ listId: string }> },
) {
  try {
    const { listId } = await params;
    if (!isValidUuid(listId)) return apiNotFound("List not found");

    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const ownerId = await getListOwnerId(listId);
    if (!ownerId || ownerId !== session.user.id) {
      return apiForbidden("You do not own this list");
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("lists").delete().eq("id", listId);
    if (error) return apiInternalError(error);

    return apiOk({ success: true });
  } catch (e) {
    return apiInternalError(e);
  }
}
