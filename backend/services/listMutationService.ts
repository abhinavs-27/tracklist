import { getSupabase } from "../lib/supabase";

export type ListRow = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  type: "album" | "song";
  visibility: string;
  emoji: string | null;
  image_url: string | null;
  created_at: string;
};

export type ListItemRow = {
  id: string;
  list_id: string;
  entity_type: "album" | "song";
  entity_id: string;
  position: number;
  added_at?: string;
};

export async function getListOwnerId(listId: string): Promise<string | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("lists")
    .select("user_id")
    .eq("id", listId)
    .maybeSingle();
  if (error || !data) return null;
  return data.user_id as string;
}

export async function createList(
  userId: string,
  title: string,
  description: string | null,
  type: "album" | "song",
  visibility: "public" | "friends" | "private",
): Promise<ListRow | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("lists")
    .insert({
      user_id: userId,
      title,
      description: description || null,
      type,
      visibility,
      emoji: null,
      image_url: null,
    })
    .select(
      "id, user_id, title, description, type, visibility, emoji, image_url, created_at",
    )
    .single();

  if (error) {
    console.error("[listMutation] createList", error);
    return null;
  }
  return data as ListRow;
}

export async function addListItem(
  listId: string,
  entityType: "album" | "song",
  entityId: string,
): Promise<ListItemRow | null> {
  const supabase = getSupabase();

  const { data: listRow, error: listError } = await supabase
    .from("lists")
    .select("type")
    .eq("id", listId)
    .maybeSingle();
  if (listError || !listRow) {
    throw listError || new Error("List not found");
  }
  const listType = (listRow.type ?? "album") as "album" | "song";
  if (entityType !== listType) {
    throw new Error("Item type does not match list type");
  }

  const { data: maxRow } = await supabase
    .from("list_items")
    .select("position")
    .eq("list_id", listId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = maxRow?.position != null ? maxRow.position + 1 : 0;

  const insertResult = await supabase
    .from("list_items")
    .insert({
      list_id: listId,
      entity_type: entityType,
      entity_id: entityId,
      position: nextPosition,
    })
    .select("id, list_id, entity_type, entity_id, position, added_at")
    .single();

  if (!insertResult.error) {
    return insertResult.data as ListItemRow;
  }
  if (insertResult.error.code === "42703") {
    const fallback = await supabase
      .from("list_items")
      .select("id, list_id, entity_type, entity_id, position")
      .eq("list_id", listId)
      .eq("position", nextPosition)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!fallback.error && fallback.data) {
      return {
        ...fallback.data,
        added_at: new Date().toISOString(),
      } as ListItemRow;
    }
  }
  throw insertResult.error;
}

export async function removeListItem(
  itemId: string,
  listId: string,
): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error: fetchError } = await supabase
    .from("list_items")
    .select("id")
    .eq("id", itemId)
    .eq("list_id", listId)
    .maybeSingle();
  if (fetchError || !data) return false;
  const { error } = await supabase.from("list_items").delete().eq("id", itemId);
  if (error) throw error;
  return true;
}
