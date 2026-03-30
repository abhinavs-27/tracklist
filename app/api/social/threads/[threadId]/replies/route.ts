import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { addThreadReply } from "@/lib/social/threads";
import { isValidUuid } from "@/lib/validation";

type PostBody = {
  body?: string;
};

export const POST = withHandler(
  async (
    request: NextRequest,
    { user: me, params },
  ) => {
    const threadId = params.threadId ?? "";
    if (!isValidUuid(threadId)) return apiBadRequest("Invalid thread");

    const parsed = await parseBody<PostBody>(request);
    if (parsed.error) return parsed.error;
    const text = parsed.data?.body?.trim();
    if (!text) return apiBadRequest("body is required");

    const result = await addThreadReply(threadId, me!.id, text);
    if (!result.ok) {
      return apiBadRequest(result.error ?? "Could not send reply");
    }
    return apiOk({ ok: true });
  },
  { requireAuth: true },
);
