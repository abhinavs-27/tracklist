/** `GET /api/lists/:listId` — mirrors Next route. */
export type ListDetailResponse = {
  list: {
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
  owner_username: string | null;
  items: ListItemEnriched[];
};

export type ListItemEnriched = {
  id: string;
  list_id: string;
  entity_type: "album" | "song";
  entity_id: string;
  position: number;
  added_at: string;
  album?: {
    name?: string;
    images?: { url: string }[];
    artists?: { name: string }[];
  };
  track?: {
    name?: string;
    artists?: { name: string }[];
    album?: { name?: string; images?: { url: string }[] };
  };
};
