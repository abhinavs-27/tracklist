import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getListOwnerId, addListItem } from "@/lib/queries";
import {
  apiUnauthorized,
  apiForbidden,
  apiBadRequest,
  apiNotFound,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { isValidUuid, isValidSpotifyId } from "@/lib/validation";

/** POST – add item to list. Body: { entity_type: 'album'|'song', entity_id }. Owner only. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { listId } = await params;
    if (!isValidUuid(listId)) return apiNotFound("List not found");

    const ownerId = await getListOwnerId(listId);
    if (!ownerId) return apiNotFound("List not found");
    if (ownerId !== session.user.id) return apiForbidden("Not the list owner");

    const { data: body, error: parseErr } = await parseBody<{ entity_type?: unknown; entity_id?: unknown }>(request);
    if (parseErr) return parseErr;

    const entityType = body?.entity_type;
    const entityId = body.entity_id;
    if (entityType !== "album" && entityType !== "song") {
      return apiBadRequest("entity_type must be 'album' or 'song'");
    }
    if (typeof entityId !== "string" || !isValidSpotifyId(entityId)) {
      return apiBadRequest("Valid entity_id (Spotify ID) required");
    }

    const item = await addListItem(listId, entityType, entityId);
    if (!item) return apiInternalError(new Error("addListItem returned null"));

    console.log("[lists] list item added", {
      userId: session.user.id,
      listId,
      itemId: item.id,
      entityType,
      entityId,
    });

    return apiOk(item);
  } catch (e) {
    return apiInternalError(e);
  }
}
