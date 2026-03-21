/** Mirrors `NotificationRow` from `lib/queries.ts` / GET `/api/notifications`. */
export type NotificationRow = {
  id: string;
  user_id: string;
  actor_user_id: string | null;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  read: boolean;
  created_at: string;
};

export type NotificationActor = {
  id: string;
  username: string;
  avatar_url: string | null;
};

export type EnrichedNotification = NotificationRow & {
  actor: NotificationActor | null;
};
