import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  data?: Record<string, unknown>;
};

export function buildPushMessage(token: string, payload: PushPayload): ExpoMessage {
  const msg: ExpoMessage = {
    to: token,
    title: payload.title,
    body: payload.body,
    sound: "default",
  };
  if (payload.data) msg.data = payload.data;
  return msg;
}

/**
 * Send a push notification to a single user.
 * Looks up their expo_push_token — silently no-ops if they have none.
 * Never throws — push failures must not break the calling operation.
 */
export async function sendPushToUser(
  admin: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  try {
    const { data } = await admin
      .from("users")
      .select("expo_push_token")
      .eq("id", userId)
      .maybeSingle();

    const token = (data as { expo_push_token?: string | null } | null)
      ?.expo_push_token;
    if (!token) return;

    await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(buildPushMessage(token, payload)),
    });
  } catch (e) {
    console.warn("[push] sendPushToUser failed", userId, e);
  }
}

/**
 * Send the same push notification to multiple users in one Expo batch call.
 * Fetches all tokens in one DB query, filters nulls, sends in 100-item chunks.
 * Never throws.
 */
export async function sendPushToUsers(
  admin: SupabaseClient,
  userIds: string[],
  payload: PushPayload,
): Promise<void> {
  if (userIds.length === 0) return;
  try {
    const DB_CHUNK = 900; // stay safely under Supabase's 1000-row default
    const allTokens: string[] = [];
    for (let i = 0; i < userIds.length; i += DB_CHUNK) {
      const chunk = userIds.slice(i, i + DB_CHUNK);
      const { data } = await admin
        .from("users")
        .select("id, expo_push_token")
        .in("id", chunk);
      const chunkTokens = (
        (data ?? []) as Array<{ id: string; expo_push_token?: string | null }>
      )
        .map((u) => u.expo_push_token)
        .filter((t): t is string => Boolean(t));
      allTokens.push(...chunkTokens);
    }

    if (allTokens.length === 0) return;

    // Expo API batching at 100
    const CHUNK = 100;
    for (let i = 0; i < allTokens.length; i += CHUNK) {
      const chunk = allTokens.slice(i, i + CHUNK);
      const messages = chunk.map((token) => buildPushMessage(token, payload));
      await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(messages),
      });
    }
  } catch (e) {
    console.warn("[push] sendPushToUsers failed", e);
  }
}
