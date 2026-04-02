import { withHandler } from "@/lib/api-handler";
import { getCommunityOverview } from "@/lib/community/get-community-overview";
import { isCommunityMember } from "@/lib/community/queries";
import {
  apiForbidden,
  apiInternalError,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

/**
 * GET /api/communities/[id]/overview
 * Lightweight dashboard: latest tracks chart (top N), weekly summary + trend, active user count.
 * Fetches chart, summary, and stats in parallel (no consensus / leaderboard / feed).
 *
 * Query: timeZone (IANA, optional), chartTopN (1–10, default 10).
 */
export const GET = withHandler(
  async (request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    const member = await isCommunityMember(id, me!.id);
    if (!member) {
      return apiForbidden("Join this community to see the overview");
    }

    const { searchParams } = new URL(request.url);
    const timeZone = searchParams.get("timeZone")?.trim() || undefined;
    const chartTopN = Number(searchParams.get("chartTopN"));

    const data = await getCommunityOverview(id, {
      timeZone,
      chartTopN: Number.isFinite(chartTopN)
        ? Math.min(10, Math.max(1, chartTopN))
        : undefined,
    });

    if (!data) {
      return apiInternalError(new Error("getCommunityOverview failed"));
    }

    const res = apiOk(data);
    res.headers.set(
      "Cache-Control",
      "private, max-age=60, stale-while-revalidate=120",
    );
    return res;
  },
  { requireAuth: true },
);
