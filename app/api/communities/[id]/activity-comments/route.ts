import { withHandler } from "@/lib/api-handler";
import {
  insertFeedActivityComment,
  listFeedActivityCommentsForTarget,
  type FeedActivityTargetType,
} from "@/lib/community/feed-activity-comments";
import { isCommunityMember } from "@/lib/community/queries";
import {
  apiBadRequest,
  apiForbidden,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { fetchUserMap } from "@/lib/queries";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { validateCommentContent } from "@/lib/validation";
import { isValidUuid } from "@/lib/validation";

function parseTargetType(raw: string | null): FeedActivityTargetType | null {
  if (raw === "review" || raw === "log") return raw;
  return null;
}

/** GET/POST — comments on a review or listen (log) scoped to this community only. */
export const GET = withHandler(
  async (request, { user: me, params }) => {
    const communityId = params.id?.trim() ?? "";
    if (!communityId || !isValidUuid(communityId)) {
      return apiBadRequest("Invalid community id");
    }
    const member = await isCommunityMember(communityId, me!.id);
    if (!member) return apiForbidden("Join this community to view comments");

    const { searchParams } = new URL(request.url);
    const targetType = parseTargetType(searchParams.get("target_type"));
    const targetId = searchParams.get("target_id")?.trim() ?? "";
    if (!targetType) return apiBadRequest("target_type must be review or log");
    if (!targetId || !isValidUuid(targetId)) {
      return apiBadRequest("Invalid target_id");
    }

    const rows = await listFeedActivityCommentsForTarget(
      communityId,
      targetType,
      targetId,
    );
    if (!rows.length) return apiOk([]);

    const admin = createSupabaseAdminClient();
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    const userMap = await fetchUserMap(admin, userIds);
    const result = rows.map((c) => ({
      ...c,
      user: userMap.get(c.user_id) ?? null,
    }));
    return apiOk(result);
  },
  { requireAuth: true },
);

export const POST = withHandler(
  async (request, { user: me, params }) => {
    const communityId = params.id?.trim() ?? "";
    if (!communityId || !isValidUuid(communityId)) {
      return apiBadRequest("Invalid community id");
    }
    const member = await isCommunityMember(communityId, me!.id);
    if (!member) return apiForbidden("Join this community to comment");

    const { data: body, error: parseErr } = await parseBody<{
      target_type?: string;
      target_id?: string;
      content?: string;
    }>(request);
    if (parseErr) return parseErr;

    const targetType = parseTargetType(body?.target_type ?? null);
    const targetId = body?.target_id?.trim() ?? "";
    if (!targetType) return apiBadRequest("target_type must be review or log");
    if (!targetId || !isValidUuid(targetId)) {
      return apiBadRequest("Invalid target_id");
    }

    const contentResult = validateCommentContent(body?.content ?? "");
    if (!contentResult.ok) return apiBadRequest(contentResult.error);

    const inserted = await insertFeedActivityComment({
      communityId,
      userId: me!.id,
      targetType,
      targetId,
      content: contentResult.value,
    });
    if (!inserted) return apiInternalError("Could not post comment");

    const admin = createSupabaseAdminClient();
    const userMap = await fetchUserMap(admin, [me!.id]);
    return apiOk({
      ...inserted,
      user: userMap.get(me!.id) ?? null,
    });
  },
  { requireAuth: true },
);
