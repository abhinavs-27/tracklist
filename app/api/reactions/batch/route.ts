import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { getUserFromRequest } from "@/lib/auth/requireApiAuth";
import { isAllowedReactionTargetType } from "@/lib/reactions/constants";
import { fetchReactionsBatch } from "@/lib/reactions/server";
import type { ReactionSnapshot } from "@/lib/reactions/types";

type BatchBody = {
  targets?: { targetType?: string; targetId?: string }[];
};

const MAX_BATCH = 400;

export const POST = withHandler(async (request: NextRequest) => {
  const parsed = await parseBody<BatchBody>(request);
  if (parsed.error) return parsed.error;
  const raw = parsed.data?.targets;
  if (!Array.isArray(raw) || raw.length === 0) {
    return apiBadRequest("targets array is required");
  }
  if (raw.length > MAX_BATCH) {
    return apiBadRequest(`At most ${MAX_BATCH} targets per request`);
  }

  const targets: { targetType: string; targetId: string }[] = [];
  for (const t of raw) {
    const targetType = t?.targetType?.trim();
    const targetId = t?.targetId?.trim();
    if (!targetType || !targetId) continue;
    if (!isAllowedReactionTargetType(targetType)) {
      return apiBadRequest("Invalid target type");
    }
    if (targetId.length > 500) {
      return apiBadRequest("Invalid target id");
    }
    targets.push({ targetType, targetId });
  }
  if (targets.length === 0) {
    return apiBadRequest("No valid targets");
  }

  const user = await getUserFromRequest(request);
  const viewerUserId = user?.id ?? null;

  const map = await fetchReactionsBatch(viewerUserId, targets);
  const results: Record<string, ReactionSnapshot> = {};
  for (const [k, v] of map) {
    results[k] = v;
  }
  return apiOk({ results });
});
