import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const { sendPushToUser, sendPushToUsers } = vi.hoisted(() => ({
  sendPushToUser: vi.fn(),
  sendPushToUsers: vi.fn(),
}));
vi.mock("@/lib/push/send", () => ({ sendPushToUser, sendPushToUsers }));

const inserted: unknown[] = [];
let prefsRow: Record<string, boolean> | null = null;

function makeAdmin() {
  return {
    from(table: string) {
      if (table === "notifications") {
        return {
          insert: async (row: unknown) => {
            inserted.push(row);
            return { error: null };
          },
        };
      }
      if (table === "notification_preferences") {
        return {
          select: () => ({
            in: async () => ({
              data: prefsRow
                ? [{ user_id: "u-owner", ...prefsRow }]
                : [],
              error: null,
            }),
          }),
        };
      }
      throw new Error("unexpected table " + table);
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  inserted.length = 0;
  prefsRow = null;
});

import { notify } from "./notify";

describe("notify", () => {
  it("inserts an in-app row and pushes when preference allows", async () => {
    await notify({
      admin: makeAdmin() as never,
      userId: "u-owner",
      actorUserId: "u-actor",
      type: "follow",
      push: { title: "t", body: "b" },
    });
    expect(inserted).toHaveLength(1);
    expect(sendPushToUsers).toHaveBeenCalledWith(
      expect.anything(),
      ["u-owner"],
      { title: "t", body: "b" },
    );
  });

  it("skips self-notifications entirely", async () => {
    await notify({
      admin: makeAdmin() as never,
      userId: "u-same",
      actorUserId: "u-same",
      type: "follow",
      push: { title: "t", body: "b" },
    });
    expect(inserted).toHaveLength(0);
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it("writes in-app row but suppresses push when category disabled", async () => {
    prefsRow = {
      social: false,
      recommendations: true,
      community: true,
      charts: false,
    };
    await notify({
      admin: makeAdmin() as never,
      userId: "u-owner",
      actorUserId: "u-actor",
      type: "follow",
      push: { title: "t", body: "b" },
    });
    expect(inserted).toHaveLength(1);
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it("does not push when no push payload is given", async () => {
    await notify({
      admin: makeAdmin() as never,
      userId: "u-owner",
      actorUserId: "u-actor",
      type: "follow",
    });
    expect(inserted).toHaveLength(1);
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });
});
