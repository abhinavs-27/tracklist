import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { categoryForType, type NotificationType } from "./types";
import { sendPushToUsers, type PushPayload } from "@/lib/push/send";

export type NotifyInput = {
  admin: SupabaseClient;
  userId: string;
  type: NotificationType;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown> | null;
  push?: PushPayload;
};

type PrefRow = {
  user_id: string;
  social: boolean;
  recommendations: boolean;
  community: boolean;
  charts: boolean;
};

const DEFAULT_PREFS = {
  social: true,
  recommendations: true,
  community: true,
  charts: false,
} as const;

/** Recipients (subset of userIds) whose preference permits push for `type`. */
async function pushAllowedFor(
  admin: SupabaseClient,
  userIds: string[],
  type: NotificationType,
): Promise<Set<string>> {
  const category = categoryForType(type);
  const allowed = new Set<string>();
  const byUser = new Map<string, PrefRow>();
  const DB_CHUNK = 900;
  for (let i = 0; i < userIds.length; i += DB_CHUNK) {
    const chunk = userIds.slice(i, i + DB_CHUNK);
    const { data } = await admin
      .from("notification_preferences")
      .select("user_id, social, recommendations, community, charts")
      .in("user_id", chunk);
    for (const r of (data ?? []) as PrefRow[]) {
      byUser.set(r.user_id, r);
    }
  }
  for (const id of userIds) {
    const row = byUser.get(id);
    const on = row ? row[category] : DEFAULT_PREFS[category];
    if (on) allowed.add(id);
  }
  return allowed;
}

function buildRow(
  userId: string,
  input: Pick<
    NotifyInput,
    "type" | "actorUserId" | "entityType" | "entityId" | "payload"
  >,
) {
  return {
    user_id: userId,
    actor_user_id: input.actorUserId ?? null,
    type: input.type,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    payload: input.payload ?? null,
  };
}

/** Single-recipient notification. Never throws. */
export async function notify(input: NotifyInput): Promise<void> {
  const { admin, userId, actorUserId } = input;
  if (actorUserId && actorUserId === userId) return;
  try {
    const { error } = await admin
      .from("notifications")
      .insert(buildRow(userId, input));
    if (error) console.warn("[notify] insert failed", error.message);
  } catch (e) {
    console.warn("[notify] insert threw", e);
  }
  if (!input.push) return;
  try {
    const allowed = await pushAllowedFor(admin, [userId], input.type);
    if (allowed.has(userId)) {
      await sendPushToUsers(admin, [userId], input.push);
    }
  } catch (e) {
    console.warn("[notify] push threw", e);
  }
}

/** Broadcast to many recipients. Never throws. */
export async function notifyMany(
  userIds: string[],
  input: Omit<NotifyInput, "userId">,
): Promise<void> {
  const recipients = input.actorUserId
    ? userIds.filter((id) => id !== input.actorUserId)
    : userIds;
  if (recipients.length === 0) return;
  const { admin } = input;
  try {
    const rows = recipients.map((id) => buildRow(id, input));
    const { error } = await admin.from("notifications").insert(rows);
    if (error) console.warn("[notify] bulk insert failed", error.message);
  } catch (e) {
    console.warn("[notify] bulk insert threw", e);
  }
  if (!input.push) return;
  try {
    const allowed = await pushAllowedFor(admin, recipients, input.type);
    const targets = recipients.filter((id) => allowed.has(id));
    if (targets.length > 0) {
      await sendPushToUsers(admin, targets, input.push);
    }
  } catch (e) {
    console.warn("[notify] bulk push threw", e);
  }
}
