import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { getListOwnerId, removeListItem } from "@/lib/queries";
import {
  apiForbidden,
  apiNotFound,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

/** DELETE – remove item from list. Owner only. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ listId: string; itemId: string }> }
) {
  try {
    const me = await requireApiAuth(request);

    const { listId, itemId } = await params;
    if (!isValidUuid(listId)) return apiNotFound("List not found");
    if (!isValidUuid(itemId)) return apiNotFound("Item not found");

    const ownerId = await getListOwnerId(listId);
    if (!ownerId) return apiNotFound("List not found");
    if (ownerId !== me.id) return apiForbidden("Not the list owner");

    const ok = await removeListItem(itemId, listId);
    if (!ok) return apiInternalError(new Error("removeListItem failed"));

    console.log("[lists] list-item-removed", {
      userId: me.id,
      listId,
      itemId,
    });

    return apiOk({ success: true, deleted_id: itemId });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
