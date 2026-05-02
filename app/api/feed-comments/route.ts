import { withHandler } from "@/lib/api-handler";
import {
  insertFeedActivityComment,
  listFeedActivityCommentsForTarget,
  type FeedActivityTargetType,
} from "@/lib/community/feed-activity-comments";
import { apiBadRequest, apiInternalError, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { fetchUserMap } from "@/lib/queries";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isValidFeedItemTargetId, validateCommentContent } from "@/lib/validation";
import { NextRequest } from "next/server";

function parseTargetType(raw: string | null): FeedActivityTargetType | null {
  if (raw === "review" || raw === "log" || raw === "feed_item") return raw;
  return null;
}

/** Global (non-community) comments on feed items. */
export const GET = withHandler(
  async (request: NextRequest) => {
    const { searchParams } = new URL(request.url);
    const targetType = parseTargetType(searchParams.get("target_type"));
    const targetId = searchParams.get("target_id")?.trim() ?? "";

    if (!targetType) return apiBadRequest("target_type required: review | log | feed_item");
    if (!targetId || !isValidFeedItemTargetId(targetId)) return apiBadRequest("Invalid target_id");

    const rows = await listFeedActivityCommentsForTarget(null, targetType, targetId);
    if (!rows.length) return apiOk([]);

    const admin = createSupabaseAdminClient();
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const userMap = await fetchUserMap(admin, userIds);
    return apiOk(rows.map((c) => ({ ...c, user: userMap.get(c.user_id) ?? null })));
  },
  { requireAuth: false },
);

export const POST = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<{
      target_type?: string;
      target_id?: string;
      content?: string;
    }>(request);
    if (parseErr) return parseErr;

    const targetType = parseTargetType(body?.target_type ?? null);
    const targetId = typeof body?.target_id === "string" ? body.target_id.trim() : "";

    if (!targetType) return apiBadRequest("target_type required: review | log | feed_item");
    if (!targetId || !isValidFeedItemTargetId(targetId)) return apiBadRequest("Invalid target_id");

    const contentResult = validateCommentContent(body?.content ?? "");
    if (!contentResult.ok) return apiBadRequest(contentResult.error);

    const inserted = await insertFeedActivityComment({
      communityId: null,
      userId: me!.id,
      targetType,
      targetId,
      content: contentResult.value,
    });
    if (!inserted) return apiInternalError("Could not post comment");

    const admin = createSupabaseAdminClient();
    const userMap = await fetchUserMap(admin, [me!.id]);
    return apiOk({ ...inserted, user: userMap.get(me!.id) ?? null });
  },
  { requireAuth: true },
);
