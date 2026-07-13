import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// vi.hoisted() because `import { GET } from "./route"` below evaluates route.ts
// (which does `new Expo()` at module scope) before plain `const` declarations
// placed earlier in this file would otherwise be initialized — a real ES-module
// evaluation-order TDZ, not a vi.mock hoisting quirk.
const { getReceipts, chunkReceiptIds } = vi.hoisted(() => ({
  getReceipts: vi.fn(),
  chunkReceiptIds: vi.fn((ids: string[]) => [ids]),
}));
vi.mock("expo-server-sdk", () => {
  class Expo {
    chunkPushNotificationReceiptIds = chunkReceiptIds;
    getPushNotificationReceiptsAsync = getReceipts;
  }
  return { Expo, default: { Expo } };
});

const receiptRows = [
  { ticket_id: "r-dead", token: "ExponentPushToken[dead]" },
  { ticket_id: "r-ok", token: "ExponentPushToken[ok]" },
  { ticket_id: "r-inflight", token: "ExponentPushToken[inflight]" },
];
const deletedTokens: string[] = [];
const deletedReceipts: string[] = [];

vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({
    from(table: string) {
      if (table === "push_receipts") {
        return {
          select: () => ({
            order: () => ({
              limit: async () => ({ data: receiptRows, error: null }),
            }),
          }),
          delete: () => ({
            in: async (_c: string, ids: string[]) => {
              deletedReceipts.push(...ids);
              return { error: null };
            },
          }),
        };
      }
      if (table === "push_tokens") {
        return {
          delete: () => ({
            in: async (_c: string, toks: string[]) => {
              deletedTokens.push(...toks);
              return { error: null };
            },
          }),
        };
      }
      throw new Error("unexpected table " + table);
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  deletedTokens.length = 0;
  deletedReceipts.length = 0;
});

import { GET } from "./route";

describe("push-receipts cron", () => {
  it("removes tokens whose receipt is DeviceNotRegistered", async () => {
    getReceipts.mockResolvedValue({
      "r-dead": { status: "error", details: { error: "DeviceNotRegistered" } },
      "r-ok": { status: "ok" },
      // "r-inflight" intentionally omitted — Expo hasn't resolved it yet.
    });
    const res = await GET();
    const body = await res.json();
    expect(deletedTokens).toEqual(["ExponentPushToken[dead]"]);
    // Only ids present in the fetched result are cleared; the unresolved
    // "r-inflight" receipt must remain so a later run can poll it again.
    expect(deletedReceipts.sort()).toEqual(["r-dead", "r-ok"]);
    expect(deletedReceipts).not.toContain("r-inflight");
    expect(body.tokensRemoved).toBe(1);
    expect(body.processed).toBe(2);
  });
});
