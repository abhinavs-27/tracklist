import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createList, searchLists, grantAchievementOnList } from "@/lib/queries";
import {
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import {
  validateListTitle,
  validateListDescription,
  validateListType,
} from "@/lib/validation";
import { clampLimit } from "@/lib/validation";

/** GET – search lists by title. ?q=...&limit= (public). Returns [] when q is missing or &lt; 2 chars. */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q")?.trim() ?? "";
    const limit = clampLimit(searchParams.get("limit"), 50, 20);
    if (q.length < 2) return apiOk([]);
    const lists = await searchLists(q, limit);
    return apiOk(lists);
  } catch (e) {
    return apiInternalError(e);
  }
}

/** POST – create a new list. Body: { title, description? }. Auth required. */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { data: body, error: parseErr } = await parseBody<{
      title?: unknown;
      description?: unknown;
      type?: unknown;
      visibility?: unknown;
      first_item?: { entity_type?: unknown; entity_id?: unknown };
      initial_items?: { entity_type?: unknown; entity_id?: unknown }[];
    }>(request);
    if (parseErr) return parseErr;

    const titleResult = validateListTitle(body!.title);
    if (!titleResult.ok) return apiBadRequest(titleResult.error);
    const typeResult = validateListType(body.type);
    if (!typeResult.ok) return apiBadRequest(typeResult.error);
    const description = validateListDescription(body.description);
    const visibilityRaw =
      typeof body.visibility === "string" ? body.visibility : "private";
    const visibility: "public" | "friends" | "private" =
      visibilityRaw === "public" || visibilityRaw === "friends"
        ? visibilityRaw
        : "private";

    const list = await createList(
      session.user.id,
      titleResult.value,
      description,
      typeResult.value,
      visibility,
    );
    if (!list) return apiInternalError(new Error("createList returned null"));

    // Optional initial items on creation – best-effort only, never blocks list creation.
    const rawItems = Array.isArray(body.initial_items)
      ? body.initial_items
      : body.first_item
        ? [body.first_item]
        : [];
    if (rawItems.length > 0) {
      try {
        const { addListItem } = await import("@/lib/queries");
        for (const raw of rawItems) {
          if (!raw?.entity_type || !raw?.entity_id) continue;
          const entityType =
            raw.entity_type === "song" ? "song" : "album";
          if (entityType !== typeResult.value) continue;
          await addListItem(list.id, entityType, String(raw.entity_id));
        }
      } catch (e) {
        console.error(
          "[lists] failed to insert initial_items on list creation:",
          e,
        );
        // continue; user can add items from the list page
      }
    }
    await grantAchievementOnList(session.user.id);

    console.log("[lists] list-created", {
      userId: session.user.id,
      listId: list.id,
    });

    return apiOk(list);
  } catch (e) {
    return apiInternalError(e);
  }
}
