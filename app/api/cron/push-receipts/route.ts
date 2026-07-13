import { Expo } from "expo-server-sdk";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { apiOk } from "@/lib/api-response";

const MAX_RECEIPTS = 1000;
const expo = new Expo();

/**
 * Poll Expo push receipts for delayed delivery failures.
 * Deletes tokens reported DeviceNotRegistered; clears processed receipt rows.
 * GET /api/cron/push-receipts
 */
export async function GET() {
  const admin = createSupabaseAdminClient();

  const { data: rows, error } = await admin
    .from("push_receipts")
    .select("ticket_id, token")
    .order("created_at", { ascending: true })
    .limit(MAX_RECEIPTS);

  if (error) {
    console.error("[cron push-receipts] query failed", error);
    return apiOk({ ok: false, processed: 0, tokensRemoved: 0 });
  }

  const receipts = (rows ?? []) as Array<{ ticket_id: string; token: string }>;
  if (receipts.length === 0) return apiOk({ processed: 0, tokensRemoved: 0 });

  const tokenByTicket = new Map(receipts.map((r) => [r.ticket_id, r.token]));
  const ids = receipts.map((r) => r.ticket_id);
  const deadTokens = new Set<string>();
  const processedIds: string[] = [];

  for (const idChunk of expo.chunkPushNotificationReceiptIds(ids)) {
    let result: Record<string, { status: string; details?: { error?: string } }>;
    try {
      result = await expo.getPushNotificationReceiptsAsync(idChunk);
    } catch (e) {
      console.warn("[cron push-receipts] fetch chunk failed", e);
      continue;
    }
    processedIds.push(...Object.keys(result));
    for (const [ticketId, receipt] of Object.entries(result)) {
      if (
        receipt.status === "error" &&
        receipt.details?.error === "DeviceNotRegistered"
      ) {
        const token = tokenByTicket.get(ticketId);
        if (token) deadTokens.add(token);
      }
    }
  }

  if (deadTokens.size > 0) {
    await admin.from("push_tokens").delete().in("token", [...deadTokens]);
  }
  if (processedIds.length > 0) {
    await admin.from("push_receipts").delete().in("ticket_id", processedIds);
  }

  console.log("[cron push-receipts] done", {
    processed: processedIds.length,
    tokensRemoved: deadTokens.size,
  });
  return apiOk({ processed: processedIds.length, tokensRemoved: deadTokens.size });
}
