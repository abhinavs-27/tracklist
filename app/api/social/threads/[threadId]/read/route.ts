import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { apiNotFound, apiOk } from "@/lib/api-response";
import { markThreadRead } from "@/lib/social/threads";
import { isValidUuid } from "@/lib/validation";

export const POST = withHandler(
  async (_request: NextRequest, { user: me, params }) => {
    const threadId = params.threadId ?? "";
    if (!isValidUuid(threadId)) return apiNotFound("Thread not found");
    await markThreadRead(threadId, me!.id);
    return apiOk({ ok: true });
  },
  { requireAuth: true },
);
