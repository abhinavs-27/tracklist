import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockFrom = vi.fn();
const mockAdmin = { from: mockFrom };
vi.mock("@/lib/supabase-admin", () => ({
  createSupabaseAdminClient: () => mockAdmin,
}));

import { buildPushMessage, EXPO_PUSH_URL } from "./send";

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true });
});

describe("buildPushMessage", () => {
  it("includes required fields", () => {
    const msg = buildPushMessage("ExponentPushToken[xxx]", {
      title: "Hello",
      body: "World",
    });
    expect(msg.to).toBe("ExponentPushToken[xxx]");
    expect(msg.title).toBe("Hello");
    expect(msg.body).toBe("World");
    expect(msg.sound).toBe("default");
  });

  it("includes optional data when provided", () => {
    const msg = buildPushMessage("ExponentPushToken[xxx]", {
      title: "t",
      body: "b",
      data: { url: "/profile/abhinav" },
    });
    expect(msg.data).toEqual({ url: "/profile/abhinav" });
  });

  it("omits data when not provided", () => {
    const msg = buildPushMessage("ExponentPushToken[xxx]", { title: "t", body: "b" });
    expect(msg.data).toBeUndefined();
  });
});

describe("EXPO_PUSH_URL", () => {
  it("is the correct Expo push endpoint", () => {
    expect(EXPO_PUSH_URL).toBe("https://exp.host/--/api/v2/push/send");
  });
});
