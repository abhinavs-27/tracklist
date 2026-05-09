import { withHandler } from "@/lib/api-handler";
import { getListOwnerId, removeListItem } from "@/lib/queries";
import {
  apiForbidden,
  apiNotFound,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { validateUuidParam } from "@/lib/api-utils";

/** DELETE – remove item from list. Owner only. */
export const DELETE = withHandler(
  async (request, { params, user: me }) => {
    const listIdRes = validateUuidParam(params.listId);
    if (!listIdRes.ok) return listIdRes.error;
    const listId = listIdRes.id;

    const itemIdRes = validateUuidParam(params.itemId);
    if (!itemIdRes.ok) return itemIdRes.error;
    const itemId = itemIdRes.id;

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
  },
  { requireAuth: true }
);
