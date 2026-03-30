import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { apiOk } from "@/lib/api-response";
import { parseThreadInboxKind } from "@/lib/social/thread-kind-ui";
import {
  listThreadsForUser,
  resolveThreadListUsernames,
} from "@/lib/social/threads";

export const GET = withHandler(
  async (request: NextRequest, { user: me }) => {
    const raw = new URL(request.url).searchParams.get("kind");
    const kind = parseThreadInboxKind(raw ?? undefined);
    const items = await listThreadsForUser(me!.id, 60, kind);
    const names = await resolveThreadListUsernames(
      items.map((i) => i.counterpart_user_id),
    );
    const threads = items.map((t) => ({
      ...t,
      counterpart_username: t.counterpart_user_id
        ? (names.get(t.counterpart_user_id) ?? null)
        : null,
    }));
    return apiOk({ threads });
  },
  { requireAuth: true },
);
