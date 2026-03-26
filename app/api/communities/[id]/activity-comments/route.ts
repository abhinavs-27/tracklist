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
import {
  isValidFeedItemTargetId,
  isValidUuid,
  validateCommentContent,
} from "@/lib/validation";

function parseTargetType(raw: string | null): FeedActivityTargetType | null {
  if (raw === "review" || raw === "log" || raw === "feed_item") return raw;
  return null;
}

function validTargetId(
  targetType: FeedActivityTargetType,
  raw: string,
): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (targetType === "feed_item") {
    return isValidFeedItemTargetId(t) ? t : null;
  }
  return isValidUuid(t) ? t : null;
}

/** GET/POST — comments on feed targets (review, log, or opaque feed row id) in this community. */
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
    const targetIdRaw = searchParams.get("target_id") ?? "";
    if (!targetType) {
      return apiBadRequest("target_type must be review, log, or feed_item");
    }
    const targetId = validTargetId(targetType, targetIdRaw);
    if (!targetId) return apiBadRequest("Invalid target_id");

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
    const targetIdRaw =
      typeof body?.target_id === "string" ? body.target_id : "";
    if (!targetType) {
      return apiBadRequest("target_type must be review, log, or feed_item");
    }
    const targetId = validTargetId(targetType, targetIdRaw);
    if (!targetId) return apiBadRequest("Invalid target_id");

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
