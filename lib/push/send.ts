import "server-only";

import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

const expo = new Expo();

export function buildPushMessage(
  token: string,
  payload: PushPayload,
): ExpoPushMessage {
  return {
    to: token,
    title: payload.title,
    body: payload.body,
    sound: "default",
    ...(payload.data ? { data: payload.data } : {}),
  };
}

async function tokensForUsers(
  admin: SupabaseClient,
  userIds: string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const out: string[] = [];
  const DB_CHUNK = 900;
  for (let i = 0; i < userIds.length; i += DB_CHUNK) {
    const chunk = userIds.slice(i, i + DB_CHUNK);
    const { data } = await admin
      .from("push_tokens")
      .select("token")
      .in("user_id", chunk);
    for (const row of (data ?? []) as Array<{ token: string }>) {
      if (row.token && Expo.isExpoPushToken(row.token)) out.push(row.token);
    }
  }
  return out;
}

/** Send to a set of tokens; clean dead tokens, record receipts. Never throws. */
async function deliver(
  admin: SupabaseClient,
  tokens: string[],
  payload: PushPayload,
): Promise<void> {
  if (tokens.length === 0) return;
  const messages = tokens.map((t) => buildPushMessage(t, payload));
  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    let tickets: ExpoPushTicket[];
    try {
      tickets = await expo.sendPushNotificationsAsync(chunk);
    } catch (e) {
      console.warn("[push] send chunk failed", e);
      continue;
    }
    const deadTokens: string[] = [];
    const receipts: Array<{ ticket_id: string; token: string }> = [];
    tickets.forEach((ticket, idx) => {
      const token = (chunk[idx].to as string) ?? "";
      if (ticket.status === "error") {
        if (ticket.details?.error === "DeviceNotRegistered") {
          deadTokens.push(token);
        }
      } else if (ticket.status === "ok" && ticket.id) {
        receipts.push({ ticket_id: ticket.id, token });
      }
    });
    if (deadTokens.length > 0) {
      await admin.from("push_tokens").delete().in("token", deadTokens);
    }
    if (receipts.length > 0) {
      await admin.from("push_receipts").upsert(receipts);
    }
  }
}

/** Send one push to all of a single user's devices. Never throws. */
export async function sendPushToUser(
  admin: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    const tokens = await tokensForUsers(admin, [userId]);
    await deliver(admin, tokens, payload);
  } catch (e) {
    console.warn("[push] sendPushToUser failed", userId, e);
  }
}

/** Send the same push to all devices of many users. Never throws. */
export async function sendPushToUsers(
  admin: SupabaseClient,
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  try {
    const tokens = await tokensForUsers(admin, userIds);
    await deliver(admin, tokens, payload);
  } catch (e) {
    console.warn("[push] sendPushToUsers failed", e);
  }
}
