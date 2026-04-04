import { withHandler } from "@/lib/api-handler";
import { apiOk } from "@/lib/api-response";
import { getPaginationParams } from "@/lib/api-utils";
import { getTasteOverlapSuggestionsForViewer } from "@/lib/onboarding/taste-overlap-suggestions";
import { enrichUsersWithFollowStatus } from "@/lib/queries";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

export const GET = withHandler(async (request, { user: me }) => {
  const { limit } = getPaginationParams(
    request.nextUrl.searchParams,
    DEFAULT_LIMIT,
    MAX_LIMIT
  );

  const rows = await getTasteOverlapSuggestionsForViewer(me!.id, { limit });
  const withoutScore = rows.map(({ score: _s, ...u }) => u);
  const users = await enrichUsersWithFollowStatus(withoutScore, me!.id);

  return apiOk({ users });
}, { requireAuth: true });
