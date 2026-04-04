import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { getListOwnerId, removeListItem } from "@/lib/queries";
import {
  apiForbidden,
  apiNotFound,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

/** DELETE – remove item from list. Owner only. */
export const DELETE = withHandler(async (request: NextRequest, { params, user: me }) => {
  const { listId, itemId } = params;
  if (!isValidUuid(listId)) return apiNotFound("List not found");
  if (!isValidUuid(itemId)) return apiNotFound("Item not found");

  const ownerId = await getListOwnerId(listId);
  if (!ownerId) return apiNotFound("List not found");
  if (ownerId !== me!.id) return apiForbidden("Not the list owner");

  const ok = await removeListItem(itemId, listId);
  if (!ok) return apiInternalError(new Error("removeListItem failed"));

  console.log("[lists] list-item-removed", {
    userId: me!.id,
    listId,
    itemId,
  });

  return apiOk({ success: true, deleted_id: itemId });
}, { requireAuth: true });
