# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire push notifications to 7 events: new follow, review like, thread reply, community invite, weekly billboard drop, and community weekly chart drop.

**Architecture:** A single `lib/push/send.ts` utility calls the Expo push API (`https://exp.host/--/api/v2/push/send`) using the `expo_push_token` stored in `users`. Each notification event looks up the recipient's token and fires a push alongside writing the DB notification row. Chart-drop notifications use the admin client to bulk-fetch tokens for all affected users. All pushes are non-fatal — a push failure never breaks the primary operation.

**Tech Stack:** Next.js App Router, Supabase admin client, Expo Push API (no SDK needed — plain fetch), TypeScript, Vitest.

---

## File Map

**New files:**
- `lib/push/send.ts` — `sendPushToUser` and `sendPushToUsers` utilities
- `lib/push/send.test.ts` — unit tests for push utilities

**Modified files:**
- `app/api/follow/route.ts` — add push after notification insert
- `app/api/likes/route.ts` — add notification insert + push on POST
- `lib/social/threads.ts` — add push inside `addThreadReply` to other participants
- `lib/community/invites.ts` — add push after notification insert
- `lib/charts/compute-weekly-charts-all.ts` — push per user after charts computed
- `lib/charts/compute-community-weekly-charts-all.ts` — push per member after community charts computed

---

## Task 1: Core push utility with tests

**Files:**
- Create: `lib/push/send.ts`
- Create: `lib/push/send.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/push/send.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Mock Supabase admin
const mockFrom = vi.fn();
const mockAdmin = {
  from: mockFrom,
};
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm run test:unit -- lib/push/send.test.ts
```

Expected: FAIL — "Cannot find module './send'"

- [ ] **Step 3: Implement the utility**

```typescript
// lib/push/send.ts
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
    const { data } = await admin
      .from("users")
      .select("id, expo_push_token")
      .in("id", userIds);

    const tokens = (
      (data ?? []) as Array<{ id: string; expo_push_token?: string | null }>
    )
      .map((u) => u.expo_push_token)
      .filter((t): t is string => Boolean(t));

    if (tokens.length === 0) return;

    // Expo recommends batches of ≤100
    const CHUNK = 100;
    for (let i = 0; i < tokens.length; i += CHUNK) {
      const chunk = tokens.slice(i, i + CHUNK);
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test:unit -- lib/push/send.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/push/send.ts lib/push/send.test.ts
git commit -m "feat: push notification utility — sendPushToUser and sendPushToUsers via Expo API"
```

---

## Task 2: New follower push

**Files:**
- Modify: `app/api/follow/route.ts`

The follow route already inserts a `notifications` row. Add a push call after it. The actor's username is needed for the push body — look it up from the `me` object (it's on the auth user).

- [ ] **Step 1: Add the push call**

Find the follow route's POST handler. After the `await supabase.from('notifications').insert(...)` block, add:

```typescript
    // Push notification to the followed user
    try {
      const { createSupabaseAdminClient } = await import("@/lib/supabase-admin");
      const { sendPushToUser } = await import("@/lib/push/send");
      const admin = createSupabaseAdminClient();
      await sendPushToUser(admin, validFollowingId, {
        title: "New follower",
        body: `@${me!.username ?? "Someone"} started following you`,
        data: { url: `/user/${me!.username ?? ""}` },
      });
    } catch (e) {
      console.warn("[follow] push failed", e);
    }
```

Note: `me!.username` — check the user type on `me`. If `username` is not on the auth user object, look it up:

```typescript
      // If me.username isn't available, fetch it
      const { data: actor } = await admin
        .from("users")
        .select("username")
        .eq("id", me!.id)
        .maybeSingle();
      const username = (actor as { username?: string } | null)?.username ?? "Someone";
      await sendPushToUser(admin, validFollowingId, {
        title: "New follower",
        body: `@${username} started following you`,
        data: { url: `/user/${username}` },
      });
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/follow/route.ts
git commit -m "feat: push notification on new follower"
```

---

## Task 3: Review like — notification insert + push

**Files:**
- Modify: `app/api/likes/route.ts`

The likes POST currently has NO notification insert. It needs to:
1. Look up the review owner
2. Skip if liker == owner (no self-notification)
3. Insert a notification row
4. Send a push

- [ ] **Step 1: Update the POST handler**

Replace the POST handler body (after the successful `likes` insert) with:

```typescript
    // Notify the review owner (skip self-likes)
    try {
      const { createSupabaseAdminClient } = await import("@/lib/supabase-admin");
      const { sendPushToUser } = await import("@/lib/push/send");
      const admin = createSupabaseAdminClient();

      // Look up the review owner
      const { data: review } = await admin
        .from("reviews")
        .select("user_id, entity_type, entity_id")
        .eq("id", validReviewId)
        .maybeSingle();

      const ownerId = (review as { user_id?: string } | null)?.user_id;
      if (ownerId && ownerId !== me!.id) {
        // Look up actor username
        const { data: actor } = await admin
          .from("users")
          .select("username")
          .eq("id", me!.id)
          .maybeSingle();
        const username = (actor as { username?: string } | null)?.username ?? "Someone";

        // DB notification row
        await admin.from("notifications").insert({
          user_id: ownerId,
          actor_user_id: me!.id,
          type: "review_like",
          entity_type: (review as { entity_type?: string } | null)?.entity_type ?? null,
          entity_id: (review as { entity_id?: string } | null)?.entity_id ?? null,
        });

        // Push
        const entityId = (review as { entity_id?: string } | null)?.entity_id;
        const entityType = (review as { entity_type?: string } | null)?.entity_type;
        await sendPushToUser(admin, ownerId, {
          title: "Someone liked your review",
          body: `@${username} liked your review`,
          data: entityType === "album" && entityId
            ? { url: `/album/${entityId}` }
            : { url: "/notifications" },
        });
      }
    } catch (e) {
      console.warn("[likes] notification/push failed", e);
    }
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/likes/route.ts
git commit -m "feat: push notification on review like — add notification insert and push"
```

---

## Task 4: Thread reply push

**Files:**
- Modify: `lib/social/threads.ts` — inside `addThreadReply`

When someone replies to a thread, all OTHER participants should get a push. The participants are already in `social_thread_participants`. The reply is already inserted — add pushes after the successful insert.

- [ ] **Step 1: Add push inside `addThreadReply`**

Find the `addThreadReply` function (around line 854). After the `social_threads` update (`last_activity_at`), add:

```typescript
  // Notify all other thread participants
  try {
    const { sendPushToUsers } = await import("@/lib/push/send");
    const { data: participants } = await admin
      .from("social_thread_participants")
      .select("user_id")
      .eq("thread_id", threadId)
      .neq("user_id", userId);

    const otherIds = ((participants ?? []) as Array<{ user_id: string }>)
      .map((p) => p.user_id);

    if (otherIds.length > 0) {
      const { data: actor } = await admin
        .from("users")
        .select("username")
        .eq("id", userId)
        .maybeSingle();
      const username = (actor as { username?: string } | null)?.username ?? "Someone";

      await sendPushToUsers(admin, otherIds, {
        title: "New reply",
        body: `@${username}: ${trimmed.slice(0, 80)}${trimmed.length > 80 ? "…" : ""}`,
        data: { url: "/notifications" },
      });
    }
  } catch (e) {
    console.warn("[threads] reply push failed", e);
  }
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/social/threads.ts
git commit -m "feat: push notification on thread reply to all participants"
```

---

## Task 5: Community invite push

**Files:**
- Modify: `lib/community/invites.ts`

The invite flow already inserts a notification row. Find it (around line 97) and add a push after.

- [ ] **Step 1: Read the invite notification insert context**

```bash
sed -n '85,120p' lib/community/invites.ts
```

- [ ] **Step 2: Add push after the notification insert**

After `await admin.from("notifications").insert({...})` (the invite notification), add:

```typescript
    // Push to invited user
    try {
      const { sendPushToUser } = await import("@/lib/push/send");
      const invitedUserId = /* the user_id field in the notification insert above */;
      const inviterUsername = /* look up from actor_user_id or pass through */;
      const communityName = /* available from context — read it from the surrounding code */;
      await sendPushToUser(admin, invitedUserId, {
        title: "You've been invited!",
        body: `@${inviterUsername} invited you to ${communityName}`,
        data: { url: "/notifications" },
      });
    } catch (e) {
      console.warn("[invites] push failed", e);
    }
```

**Important:** Read the actual variable names for `invitedUserId`, `inviterUsername`, and `communityName` from the surrounding code before inserting — they will already be in scope. Do not guess variable names.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add lib/community/invites.ts
git commit -m "feat: push notification on community invite"
```

---

## Task 6: Weekly billboard drop push

**Files:**
- Modify: `lib/charts/compute-weekly-charts-all.ts`

After the per-user chart loop completes (inside `computeWeeklyChartsForAllUsers`), send a push to each user whose chart was computed. The `userIds` array is already available.

- [ ] **Step 1: Add push after the chart loop**

Find the end of `computeWeeklyChartsForAllUsers`. After the `for` loop over `userIds`, add:

```typescript
  // Push each user that got a chart
  if (userIds.length > 0) {
    try {
      const { createSupabaseAdminClient } = await import("@/lib/supabase-admin");
      const { sendPushToUsers } = await import("@/lib/push/send");
      const admin = createSupabaseAdminClient();
      await sendPushToUsers(admin, userIds, {
        title: "Your weekly chart is ready 🎵",
        body: "See what you listened to most this week",
        data: { url: "/" },
      });
    } catch (e) {
      console.warn("[charts] billboard push failed", e);
    }
  }
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/charts/compute-weekly-charts-all.ts
git commit -m "feat: push notification on weekly billboard chart drop"
```

---

## Task 7: Community weekly chart drop push

**Files:**
- Modify: `lib/charts/compute-community-weekly-charts-all.ts`

After each community's charts are computed, send a push to all members of that community.

- [ ] **Step 1: Add push inside the community loop**

Find the `for (const communityId of communityIds)` loop. After the inner chart-type loop, add:

```typescript
    // Push all community members when their chart drops
    try {
      const { createSupabaseAdminClient } = await import("@/lib/supabase-admin");
      const { sendPushToUsers } = await import("@/lib/push/send");
      const admin = createSupabaseAdminClient();

      // Fetch community name and member IDs in parallel
      const [nameRes, membersRes] = await Promise.all([
        admin.from("communities").select("name").eq("id", communityId).maybeSingle(),
        admin.from("community_members").select("user_id").eq("community_id", communityId),
      ]);

      const communityName = (nameRes.data as { name?: string } | null)?.name ?? "Your community";
      const memberIds = ((membersRes.data ?? []) as Array<{ user_id: string }>)
        .map((m) => m.user_id);

      if (memberIds.length > 0) {
        await sendPushToUsers(admin, memberIds, {
          title: `${communityName} weekly chart is ready`,
          body: "See what your community listened to most this week",
          data: { url: `/communities/${communityId}` },
        });
      }
    } catch (e) {
      console.warn("[community-charts] push failed", communityId, e);
    }
```

Place this block after the inner `for (const chartType of CHART_TYPES)` loop closes, still inside the outer `for (const communityId of communityIds)` loop.

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/charts/compute-community-weekly-charts-all.ts
git commit -m "feat: push notification on community weekly chart drop"
```

---

## Self-Review

**Spec coverage:**
- ✅ Task 1 — core push utility with unit tests
- ✅ Task 2 — new follower push
- ✅ Task 3 — review like notification insert + push
- ✅ Task 4 — thread reply push to all participants
- ✅ Task 5 — community invite push
- ✅ Task 6 — weekly billboard drop push
- ✅ Task 7 — community weekly chart drop push

**Notes for implementer:**
- Task 5 uses a placeholder comment for variable names — you MUST read `lib/community/invites.ts` around line 97 before writing the push code. The exact variable names for invited user, inviter, and community name are in scope from the surrounding code.
- All push calls are wrapped in `try/catch` and use dynamic imports. Push failures must NEVER cause the primary operation to fail or return an error to the client.
- The Expo push API accepts both a single message object and an array of message objects. `sendPushToUser` sends a single object; `sendPushToUsers` sends an array (batched at 100).
- `sendPushToUsers` in Task 6 sends one batch request to Expo covering all users — this is efficient. Do not loop and call `sendPushToUser` per user.
- The `me!.username` field: check whether the NextAuth `requireApiAuth` result includes `username`. If not, add a DB lookup (the pattern is shown in Task 2).
- Deep link `data.url` values: the mobile app's `routeFromPushData` routes `/user/:username`, `/album/:id`, `/song/:id`, `/list/:id`, and any path starting with `/`. Use `/notifications` as the generic fallback.
