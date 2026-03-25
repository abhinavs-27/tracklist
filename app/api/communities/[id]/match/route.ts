import { withHandler } from "@/lib/api-handler";
import { getCommunityMatch } from "@/lib/taste/getCommunityMatch";
import {
  communityMatchShortLabel,
  tasteSimilarityLabel,
} from "@/lib/taste/tasteLabels";
import { apiNotFound, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

/** GET /api/communities/:id/match — user vs community listening vector (30d). */
export const GET = withHandler(
  async (_request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    const { score } = await getCommunityMatch(me!.id, id);
    return apiOk({
      score,
      label: tasteSimilarityLabel(score),
      shortLabel: communityMatchShortLabel(score),
    });
  },
  { requireAuth: true },
);
