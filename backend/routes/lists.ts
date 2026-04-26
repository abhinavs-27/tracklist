import { Router } from "express";
import {
  ok,
  notFound,
  internalError,
  badRequest,
  forbidden,
  unauthorized,
} from "../lib/http";
import { getAlbum, getTrack } from "../lib/spotify";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";
import {
  isValidUuid,
  isValidSpotifyId,
  validateListTitle,
  validateListDescription,
  validateListType,
} from "../lib/validation";
import { getSessionUserId } from "../lib/auth";
import {
  addListItem,
  createList,
  getListOwnerId,
  removeListItem,
} from "../services/listMutationService";

/**
 * `/api/lists` — CRUD + items (same contracts as Next.js `app/api/lists/*`).
 * Mobile uses Bearer auth; all mutations require ownership where applicable.
 */
export const listsRouter = Router();

/** POST /api/lists — create list (auth). */
listsRouter.post("/", async (req, res) => {
  if (!isSupabaseConfigured()) {
    internalError(res, new Error("Server misconfigured"));
    return;
  }
  const userId = await getSessionUserId(req);
  if (!userId) {
    unauthorized(res);
    return;
  }

  const body = req.body as {
    title?: unknown;
    description?: unknown;
    type?: unknown;
    visibility?: unknown;
    initial_items?: { entity_type?: unknown; entity_id?: unknown }[];
  };

  const titleResult = validateListTitle(body.title);
  if (!titleResult.ok) {
    badRequest(res, titleResult.error);
    return;
  }
  const typeResult = validateListType(body.type);
  if (!typeResult.ok) {
    badRequest(res, typeResult.error);
    return;
  }
  const description = validateListDescription(body.description);
  const visibilityRaw =
    typeof body.visibility === "string" ? body.visibility : "private";
  const visibility: "public" | "friends" | "private" =
    visibilityRaw === "public" || visibilityRaw === "friends"
      ? visibilityRaw
      : "private";

  try {
    const list = await createList(
      userId,
      titleResult.value,
      description,
      typeResult.value,
      visibility,
    );
    if (!list) {
      internalError(res, new Error("createList failed"));
      return;
    }

    const rawItems = Array.isArray(body.initial_items) ? body.initial_items : [];
    for (const raw of rawItems) {
      if (!raw?.entity_type || !raw?.entity_id) continue;
      const entityType = raw.entity_type === "song" ? "song" : "album";
      if (entityType !== typeResult.value) continue;
      try {
        await addListItem(list.id, entityType, String(raw.entity_id));
      } catch (e) {
        console.warn("[lists] initial_items insert skipped:", e);
      }
    }

    ok(res, list);
  } catch (e) {
    internalError(res, e);
  }
});

/** POST /api/lists/:listId/items — add album/song (owner). */
listsRouter.post("/:listId/items", async (req, res) => {
  if (!isSupabaseConfigured()) {
    internalError(res, new Error("Server misconfigured"));
    return;
  }
  const userId = await getSessionUserId(req);
  if (!userId) {
    unauthorized(res);
    return;
  }

  const { listId } = req.params;
  if (!isValidUuid(listId)) {
    notFound(res, "List not found");
    return;
  }

  const body = req.body as { entity_type?: unknown; entity_id?: unknown };
  const entityType = body.entity_type;
  const entityId = body.entity_id;
  if (entityType !== "album" && entityType !== "song") {
    badRequest(res, "entity_type must be 'album' or 'song'");
    return;
  }
  if (typeof entityId !== "string" || !isValidSpotifyId(entityId)) {
    badRequest(res, "Valid entity_id (Spotify ID) required");
    return;
  }

  try {
    const ownerId = await getListOwnerId(listId);
    if (!ownerId) {
      notFound(res, "List not found");
      return;
    }
    if (ownerId !== userId) {
      forbidden(res, "Not the list owner");
      return;
    }

    const item = await addListItem(listId, entityType, entityId);
    if (!item) {
      internalError(res, new Error("addListItem failed"));
      return;
    }
    ok(res, item);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("match list") || msg.includes("not found")) {
      badRequest(res, msg || "Cannot add item");
      return;
    }
    internalError(res, e);
  }
});

/** DELETE /api/lists/:listId/items/:itemId — remove item (owner). */
listsRouter.delete("/:listId/items/:itemId", async (req, res) => {
  if (!isSupabaseConfigured()) {
    internalError(res, new Error("Server misconfigured"));
    return;
  }
  const userId = await getSessionUserId(req);
  if (!userId) {
    unauthorized(res);
    return;
  }

  const { listId, itemId } = req.params;
  if (!isValidUuid(listId) || !isValidUuid(itemId)) {
    notFound(res, "Not found");
    return;
  }

  try {
    const ownerId = await getListOwnerId(listId);
    if (!ownerId) {
      notFound(res, "List not found");
      return;
    }
    if (ownerId !== userId) {
      forbidden(res, "Not the list owner");
      return;
    }

    const okRemove = await removeListItem(itemId, listId);
    if (!okRemove) {
      internalError(res, new Error("removeListItem failed"));
      return;
    }
    ok(res, { success: true, deleted_id: itemId });
  } catch (e) {
    internalError(res, e);
  }
});

/** GET /api/lists/:listId — public detail + enriched items. */
listsRouter.get("/:listId", async (req, res) => {
  const listId = req.params.listId;
  if (!isValidUuid(listId)) {
    notFound(res, "List not found");
    return;
  }
  if (!isSupabaseConfigured()) {
    internalError(res, new Error("Server misconfigured"));
    return;
  }

  try {
    const supabase = getSupabase();

    const { data: listRow, error: listError } = await supabase
      .from("lists")
      .select(
        "user_id, title, description, type, visibility, emoji, image_url, created_at",
      )
      .eq("id", listId)
      .maybeSingle();

    if (listError || !listRow) {
      notFound(res, "List not found");
      return;
    }

    let itemRows:
      | {
          id: string;
          list_id: string;
          entity_type: string;
          entity_id: string;
          position: number;
          added_at?: string;
        }[]
      | null = null;
    let itemsError: { code?: string } | null = null;

    const itemsResult = await supabase
      .from("list_items")
      .select("id, entity_type, entity_id, position, added_at")
      .eq("list_id", listId)
      .order("position", { ascending: true })
      .range(0, 99);

    itemRows = (itemsResult.data ?? []).map((r: { id: string, entity_type: string, entity_id: string, position: number, added_at?: string }) => ({ ...r, list_id: listId }));
    itemsError = itemsResult.error;

    if (itemsError?.code === "42703") {
      const fallback = await supabase
        .from("list_items")
        .select("id, entity_type, entity_id, position")
        .eq("list_id", listId)
        .order("position", { ascending: true })
        .range(0, 99);
      if (!fallback.error) {
        itemRows = (fallback.data ?? []).map((r) => ({
          ...r,
          list_id: listId,
          added_at: new Date().toISOString(),
        }));
        itemsError = null;
      }
    }

    const safeItemRows = itemsError ? [] : (itemRows ?? []);
    if (itemsError) {
      console.error("[lists] list_items error:", itemsError);
    }

    const { data: owner } = await supabase
      .from("users")
      .select("username")
      .eq("id", listRow.user_id as string)
      .maybeSingle();

    const enriched = await Promise.all(
      safeItemRows.map(async (item) => {
        try {
          if (item.entity_type === "album") {
            const album = await getAlbum(item.entity_id);
            return {
              ...item,
              album: album as SpotifyApi.AlbumObjectSimplified,
            };
          }
          if (item.entity_type === "song") {
            const track = await getTrack(item.entity_id);
            return { ...item, track };
          }
          return { ...item };
        } catch (e) {
          console.warn(
            `[lists] Failed to fetch ${item.entity_type} ${item.entity_id}:`,
            e,
          );
          return { ...item };
        }
      }),
    );

    ok(res, {
      list: { ...listRow, id: listId },
      owner_username: owner?.username ?? null,
      items: enriched,
    });
  } catch (e) {
    internalError(res, e);
  }
});

/** PATCH /api/lists/:listId — update metadata (owner). */
listsRouter.patch("/:listId", async (req, res) => {
  if (!isSupabaseConfigured()) {
    internalError(res, new Error("Server misconfigured"));
    return;
  }
  const userId = await getSessionUserId(req);
  if (!userId) {
    unauthorized(res);
    return;
  }

  const { listId } = req.params;
  if (!isValidUuid(listId)) {
    notFound(res, "List not found");
    return;
  }

  const body = req.body as {
    title?: unknown;
    description?: unknown;
    visibility?: unknown;
    image_url?: unknown;
  };

  try {
    const ownerId = await getListOwnerId(listId);
    if (!ownerId) {
      notFound(res, "List not found");
      return;
    }
    if (ownerId !== userId) {
      forbidden(res, "You do not own this list");
      return;
    }

    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const titleResult = validateListTitle(body.title);
      if (!titleResult.ok) {
        badRequest(res, titleResult.error);
        return;
      }
      updates.title = titleResult.value;
    }
    if (body.description !== undefined) {
      updates.description = validateListDescription(body.description);
    }
    if (body.visibility !== undefined) {
      const v = body.visibility;
      if (v !== "public" && v !== "friends" && v !== "private") {
        badRequest(res, "Invalid visibility");
        return;
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
      badRequest(res, "No fields to update");
      return;
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("lists")
      .update(updates)
      .eq("id", listId)
      .select(
        "id, user_id, title, description, type, visibility, emoji, image_url, created_at",
      )
      .maybeSingle();

    if (error || !data) {
      internalError(res, error ?? new Error("Update failed"));
      return;
    }
    ok(res, data);
  } catch (e) {
    internalError(res, e);
  }
});

/** DELETE /api/lists/:listId — delete list (owner). */
listsRouter.delete("/:listId", async (req, res) => {
  if (!isSupabaseConfigured()) {
    internalError(res, new Error("Server misconfigured"));
    return;
  }
  const userId = await getSessionUserId(req);
  if (!userId) {
    unauthorized(res);
    return;
  }

  const { listId } = req.params;
  if (!isValidUuid(listId)) {
    notFound(res, "List not found");
    return;
  }

  try {
    const ownerId = await getListOwnerId(listId);
    if (!ownerId) {
      notFound(res, "List not found");
      return;
    }
    if (ownerId !== userId) {
      forbidden(res, "You do not own this list");
      return;
    }

    const supabase = getSupabase();
    const { error } = await supabase.from("lists").delete().eq("id", listId);
    if (error) {
      internalError(res, error);
      return;
    }
    ok(res, { success: true });
  } catch (e) {
    internalError(res, e);
  }
});
