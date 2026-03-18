import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getListOwnerId, removeListItem } from "@/lib/queries";
import {
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

/** DELETE – remove item from list. Owner only. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ listId: string; itemId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { listId, itemId } = await params;
    if (!isValidUuid(listId)) return apiNotFound("List not found");
    if (!isValidUuid(itemId)) return apiNotFound("Item not found");

    const ownerId = await getListOwnerId(listId);
    if (!ownerId) return apiNotFound("List not found");
    if (ownerId !== session.user.id) return apiForbidden("Not the list owner");

    const ok = await removeListItem(itemId, listId);
    if (!ok) return apiInternalError(new Error("removeListItem failed"));

    console.log("[lists] list-item-removed", {
      userId: session.user.id,
      listId,
      itemId,
    });

    return apiOk({ success: true, deleted_id: itemId });
  } catch (e) {
    return apiInternalError(e);
  }
}
