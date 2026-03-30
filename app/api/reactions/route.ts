import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiForbidden,
  apiInternalError,
  apiOk,
  apiUnauthorized,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { resolveUserIdForMutation } from "@/lib/auth/requireApiAuth";
import { LIKES_ENABLED } from "@/lib/feature-likes";
import { isAllowedReactionEmoji, isAllowedReactionTargetType } from "@/lib/reactions/constants";
import { reactionTargetKey } from "@/lib/reactions/keys";
import { clearReactionForUser, setReactionForUser } from "@/lib/reactions/server";
import { afterReactionHook } from "@/lib/social/threads";

type PostBody = {
  targetType?: string;
  targetId?: string;
  emoji?: string;
};

export const POST = withHandler(
  async (request: NextRequest, { user: me }) => {
    if (!LIKES_ENABLED) {
      return apiForbidden("Likes are disabled");
    }
    const parsed = await parseBody<PostBody>(request);
    if (parsed.error) return parsed.error;
    const body = parsed.data;
    const targetType = body?.targetType?.trim();
    const targetId = body?.targetId?.trim();
    const emoji = body?.emoji?.trim();

    if (!targetType || !targetId || !emoji) {
      return apiBadRequest("targetType, targetId, and emoji are required");
    }
    if (!isAllowedReactionTargetType(targetType)) {
      return apiBadRequest("Invalid target type");
    }
    if (targetId.length > 500) {
      return apiBadRequest("Invalid target id");
    }
    if (!isAllowedReactionEmoji(emoji)) {
      return apiBadRequest("Invalid emoji");
    }

    try {
      const userId = await resolveUserIdForMutation(me!, request);
      if (!userId) {
        return apiUnauthorized(
          "Your account could not be loaded. Sign out and sign in again.",
        );
      }

      const { snapshot } = await setReactionForUser(
        userId,
        targetType,
        targetId,
        emoji,
      );
      void afterReactionHook(userId, targetType, targetId);
      return apiOk({
        key: reactionTargetKey({ targetType, targetId }),
        snapshot,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      if (msg === "Invalid target type" || msg === "Invalid emoji" || msg === "Invalid target id") {
        return apiBadRequest(msg);
      }
      return apiInternalError(e);
    }
  },
  { requireAuth: true },
);

export const DELETE = withHandler(
  async (request: NextRequest, { user: me }) => {
    if (!LIKES_ENABLED) {
      return apiForbidden("Likes are disabled");
    }
    const { searchParams } = new URL(request.url);
    const targetType = searchParams.get("targetType")?.trim();
    const targetId = searchParams.get("targetId")?.trim();
    if (!targetType || !targetId) {
      return apiBadRequest("targetType and targetId are required");
    }
    if (!isAllowedReactionTargetType(targetType)) {
      return apiBadRequest("Invalid target type");
    }
    if (targetId.length > 500) {
      return apiBadRequest("Invalid target id");
    }

    try {
      const userId = await resolveUserIdForMutation(me!, request);
      if (!userId) {
        return apiUnauthorized(
          "Your account could not be loaded. Sign out and sign in again.",
        );
      }

      const { snapshot } = await clearReactionForUser(userId, targetType, targetId);
      void afterReactionHook(userId, targetType, targetId);
      return apiOk({
        key: reactionTargetKey({ targetType, targetId }),
        snapshot,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      if (msg === "Invalid target type" || msg === "Invalid target id") {
        return apiBadRequest(msg);
      }
      return apiInternalError(e);
    }
  },
  { requireAuth: true },
);
