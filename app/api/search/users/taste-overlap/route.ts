import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { enrichUsersWithFollowStatus } from "@/lib/queries";
import { apiInternalError, apiOk } from "@/lib/api-response";
import { getTasteOverlapSuggestionsForViewer } from "@/lib/onboarding/taste-overlap-suggestions";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

export async function GET(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);
    const { searchParams } = request.nextUrl;
    const raw = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
    const limit =
      Number.isFinite(raw) && raw >= 1 ? Math.min(raw, MAX_LIMIT) : DEFAULT_LIMIT;

    const rows = await getTasteOverlapSuggestionsForViewer(me.id, { limit });
    const withoutScore = rows.map(({ score: _s, ...u }) => u);
    const users = await enrichUsersWithFollowStatus(withoutScore, me.id);

    return apiOk({ users });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
