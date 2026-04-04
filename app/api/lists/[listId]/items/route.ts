import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { getListOwnerId, addListItem } from "@/lib/queries";
import {
  apiForbidden,
  apiBadRequest,
  apiNotFound,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { isValidUuid, isValidSpotifyId } from "@/lib/validation";

/** POST – add item to list. Body: { entity_type: 'album'|'song', entity_id }. Owner only. */
export const POST = withHandler(async (request: NextRequest, { params, user: me }) => {
  const { listId } = params;
  if (!isValidUuid(listId)) return apiNotFound("List not found");

  const ownerId = await getListOwnerId(listId);
  if (!ownerId) return apiNotFound("List not found");
  if (ownerId !== me!.id) return apiForbidden("Not the list owner");

  const { data: body, error: parseErr } = await parseBody<{ entity_type?: unknown; entity_id?: unknown }>(request);
  if (parseErr) return parseErr;

  const entityType = body?.entity_type;
  const entityId = body!.entity_id;
  if (entityType !== "album" && entityType !== "song") {
    return apiBadRequest("entity_type must be 'album' or 'song'");
  }
  if (typeof entityId !== "string" || !isValidSpotifyId(entityId)) {
    return apiBadRequest("Valid entity_id (Spotify ID) required");
  }

  const item = await addListItem(listId, entityType, entityId);
  if (!item) return apiInternalError(new Error("addListItem returned null"));

  try {
    const { createSupabaseServerClient } = await import(
      "@/lib/supabase-server"
    );
    const { fanOutListItemAddForUserCommunities } = await import(
      "@/lib/community/community-feed-insert"
    );
    const sb = await createSupabaseServerClient();
    const { data: listRow } = await sb
      .from("lists")
      .select("title")
      .eq("id", listId)
      .maybeSingle();
    const title =
      (listRow as { title?: string } | null)?.title?.trim() || "My list";
    await fanOutListItemAddForUserCommunities({
      userId: me!.id,
      listId,
      listTitle: title,
      entityType,
      entityId,
      itemId: item.id,
      addedAt: item.added_at ?? new Date().toISOString(),
    });
  } catch (e) {
    console.warn("[lists] community_feed fan-out", e);
  }

  console.log("[lists] list-item-added", {
    userId: me!.id,
    listId,
    itemId: item.id,
    entityType,
    entityId,
  });

  return apiOk(item);
}, { requireAuth: true });
