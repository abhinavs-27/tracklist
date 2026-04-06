import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { getListeningInsights } from "@/lib/taste/listening-insights";
import { validateUuidParam } from "@/lib/api-utils";

/**
 * GET /api/listening-insights?userId=<uuid optional>
 * Requires auth. Without userId, returns insights for the signed-in user.
 */
export const GET = withHandler(
  async (request, { user: me }) => {
    const { searchParams } = request.nextUrl;
    const raw = searchParams.get("userId")?.trim();

    let targetId = me!.id;
    if (raw) {
      const uuidRes = validateUuidParam(raw);
      if (!uuidRes.ok) return uuidRes.error;
      targetId = uuidRes.id;
    }

    const data = await getListeningInsights(targetId);
    return apiOk(data);
  },
  { requireAuth: true },
);
