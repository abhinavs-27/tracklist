import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Mock expo-server-sdk with a controllable Expo instance.
// NOTE: wrapped in vi.hoisted() because the `import { sendPushToUsers } from "./send"`
// below evaluates `send.ts` (which does `new Expo()` at module scope) before plain
// `const` declarations placed earlier in this file would otherwise be initialized —
// a real ES-module evaluation-order TDZ, not a vi.mock hoisting quirk. vi.hoisted()
// runs these initializers before any imports are evaluated, so the mock factory's
// closure over them is safe.
const { sendChunk, chunkPushNotifications } = vi.hoisted(() => ({
  sendChunk: vi.fn(),
  chunkPushNotifications: vi.fn((msgs: unknown[]) => [msgs]),
}));
vi.mock("expo-server-sdk", () => {
  class Expo {
    static isExpoPushToken = vi.fn(() => true);
    chunkPushNotifications = chunkPushNotifications;
    sendPushNotificationsAsync = sendChunk;
  }
  return { Expo, default: { Expo } };
});

// Supabase admin mock: chainable query builder.
const tokenRows: Array<{ token: string }> = [];
const deletedTokens: string[] = [];
const insertedReceipts: Array<{ ticket_id: string; token: string }> = [];

function makeAdmin() {
  return {
    from(table: string) {
      if (table === "push_tokens") {
        return {
          select: () => ({
            in: async () => ({ data: tokenRows, error: null }),
            eq: async () => ({ data: tokenRows, error: null }),
          }),
          delete: () => ({
            in: async (_c: string, vals: string[]) => {
              deletedTokens.push(...vals);
              return { error: null };
            },
          }),
        };
      }
      if (table === "push_receipts") {
        return {
          upsert: async (rows: Array<{ ticket_id: string; token: string }>) => {
            insertedReceipts.push(...rows);
            return { error: null };
          },
        };
      }
      throw new Error("unexpected table " + table);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tokenRows.length = 0;
  deletedTokens.length = 0;
  insertedReceipts.length = 0;
});

import { sendPushToUsers } from "./send";

describe("sendPushToUsers", () => {
  it("deletes tokens that return DeviceNotRegistered", async () => {
    tokenRows.push({ token: "ExponentPushToken[dead]" });
    sendChunk.mockResolvedValue([
      { status: "error", details: { error: "DeviceNotRegistered" } },
    ]);
    await sendPushToUsers(makeAdmin() as never, ["u1"], {
      title: "t",
      body: "b",
    });
    expect(deletedTokens).toContain("ExponentPushToken[dead]");
  });

  it("stores receipt ids for ok tickets", async () => {
    tokenRows.push({ token: "ExponentPushToken[good]" });
    sendChunk.mockResolvedValue([{ status: "ok", id: "receipt-1" }]);
    await sendPushToUsers(makeAdmin() as never, ["u1"], {
      title: "t",
      body: "b",
    });
    expect(insertedReceipts).toEqual([
      { ticket_id: "receipt-1", token: "ExponentPushToken[good]" },
    ]);
  });

  it("no-ops when there are no tokens", async () => {
    await sendPushToUsers(makeAdmin() as never, ["u1"], {
      title: "t",
      body: "b",
    });
    expect(sendChunk).not.toHaveBeenCalled();
  });
});
