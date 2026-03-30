import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationRow = {
  id: string;
  user_id: string;
  actor_user_id: string | null;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  payload?: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
};

export async function listNotifications(
  supabase: SupabaseClient,
  userId: string,
  limit = 50,
  offset = 0,
): Promise<NotificationRow[]> {
  const from = offset;
  const to = offset + limit - 1;
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, actor_user_id, type, entity_type, entity_id, payload, read, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) {
    console.error("[notificationsService] list", error);
    return [];
  }
  return (data ?? []).map((n: unknown) => ({ ...(n as Record<string, unknown>), user_id: userId })) as NotificationRow[];
}

export async function markNotificationsRead(
  supabase: SupabaseClient,
  userId: string,
  notificationIds?: string[],
): Promise<void> {
  let q = supabase.from("notifications").update({ read: true }).eq("user_id", userId);
  if (notificationIds?.length) q = q.in("id", notificationIds);
  const { error } = await q;
  if (error) console.error("[notificationsService] mark read", error);
}
