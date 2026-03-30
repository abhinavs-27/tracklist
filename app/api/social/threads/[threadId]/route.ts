import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { apiNotFound, apiOk } from "@/lib/api-response";
import { getThreadDetail } from "@/lib/social/threads";
import { isValidUuid } from "@/lib/validation";

export const GET = withHandler(
  async (_request: NextRequest, { user: me, params }) => {
    const threadId = params.threadId ?? "";
    if (!isValidUuid(threadId)) return apiNotFound("Thread not found");
    const detail = await getThreadDetail(threadId, me!.id);
    if (!detail) return apiNotFound("Thread not found");
    return apiOk({ detail });
  },
  { requireAuth: true },
);
