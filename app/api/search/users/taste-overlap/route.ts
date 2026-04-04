import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { enrichUsersWithFollowStatus } from "@/lib/queries";
import { apiOk } from "@/lib/api-response";
import { getTasteOverlapSuggestionsForViewer } from "@/lib/onboarding/taste-overlap-suggestions";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

export const GET = withHandler(async (request: NextRequest, { user: me }) => {
  const { searchParams } = new URL(request.url);
  const raw = parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10);
  const limit =
    Number.isFinite(raw) && raw >= 1 ? Math.min(raw, MAX_LIMIT) : DEFAULT_LIMIT;

  const rows = await getTasteOverlapSuggestionsForViewer(me!.id, { limit });
  const withoutScore = rows.map(({ score: _s, ...u }) => u);
  const users = await enrichUsersWithFollowStatus(withoutScore, me!.id);

  return apiOk({ users });
}, { requireAuth: true });
