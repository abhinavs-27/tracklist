import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { isAllowedReactionEmoji, isAllowedReactionTargetType } from "@/lib/reactions/constants";
import { reactionTargetKey } from "@/lib/reactions/keys";
import {
  clearReactionForUser,
  setReactionForUser,
} from "@/lib/reactions/server";

type PostBody = {
  targetType?: string;
  targetId?: string;
  emoji?: string;
};

export const POST = withHandler(
  async (request: NextRequest, { user: me }) => {
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
      const { snapshot } = await setReactionForUser(
        me!.id,
        targetType,
        targetId,
        emoji,
      );
      return apiOk({
        key: reactionTargetKey({ targetType, targetId }),
        snapshot,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      if (msg === "Invalid target type" || msg === "Invalid emoji" || msg === "Invalid target id") {
        return apiBadRequest(msg);
      }
      throw e;
    }
  },
  { requireAuth: true },
);

export const DELETE = withHandler(
  async (request: NextRequest, { user: me }) => {
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
      const { snapshot } = await clearReactionForUser(me!.id, targetType, targetId);
      return apiOk({
        key: reactionTargetKey({ targetType, targetId }),
        snapshot,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      if (msg === "Invalid target type" || msg === "Invalid target id") {
        return apiBadRequest(msg);
      }
      throw e;
    }
  },
  { requireAuth: true },
);
