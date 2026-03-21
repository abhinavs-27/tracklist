/** Mirrors `GET /api/users/:userId/lists` list rows (Express + Next). */
export type UserListSummary = {
  id: string;
  title: string;
  description: string | null;
  type: "album" | "song";
  visibility: "public" | "friends" | "private";
  emoji: string | null;
  image_url: string | null;
  created_at: string;
  item_count: number;
};

export type UserListsApiResponse = { lists: UserListSummary[] };
