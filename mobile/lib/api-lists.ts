import { fetcher } from "./api";
import type { ListDetailResponse } from "./types/list-detail";

export type ListRow = ListDetailResponse["list"];

export async function createList(body: {
  title: string;
  description?: string | null;
  type: "album" | "song";
  visibility: "public" | "friends" | "private";
  initial_items?: { entity_type: "album" | "song"; entity_id: string }[];
}): Promise<ListRow> {
  return fetcher<ListRow>("/api/lists", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function patchList(
  listId: string,
  body: {
    title?: string;
    description?: string | null;
    visibility?: "public" | "friends" | "private";
  },
): Promise<ListRow> {
  return fetcher<ListRow>(`/api/lists/${encodeURIComponent(listId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteList(listId: string): Promise<void> {
  await fetcher(`/api/lists/${encodeURIComponent(listId)}`, {
    method: "DELETE",
  });
}

export async function addListItem(
  listId: string,
  entity_type: "album" | "song",
  entity_id: string,
): Promise<{ id: string }> {
  return fetcher(`/api/lists/${encodeURIComponent(listId)}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entity_type, entity_id }),
  });
}

export async function removeListItem(
  listId: string,
  itemId: string,
): Promise<void> {
  await fetcher(
    `/api/lists/${encodeURIComponent(listId)}/items/${encodeURIComponent(itemId)}`,
    { method: "DELETE" },
  );
}
