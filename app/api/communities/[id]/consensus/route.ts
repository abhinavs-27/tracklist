import { withHandler } from "@/lib/api-handler";
import {
  type ConsensusEntityType,
  type ConsensusRange,
  getCommunityConsensusRankings,
} from "@/lib/community/getCommunityConsensus";
import { isCommunityMember } from "@/lib/community/queries";
import { apiForbidden, apiNotFound, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

const TYPES: ConsensusEntityType[] = ["track", "album", "artist"];
const RANGES: ConsensusRange[] = ["month", "year"];

function parseType(raw: string | null): ConsensusEntityType {
  if (raw && TYPES.includes(raw as ConsensusEntityType)) {
    return raw as ConsensusEntityType;
  }
  return "track";
}

function parseRange(raw: string | null): ConsensusRange {
  if (raw && RANGES.includes(raw as ConsensusRange)) {
    return raw as ConsensusRange;
  }
  return "month";
}

/** GET /api/communities/[id]/consensus — shared favorites ranking; members only. Cached ~5m. */
export const GET = withHandler(
  async (request, { user: me, params }) => {
    const id = params.id?.trim() ?? "";
    if (!id || !isValidUuid(id)) return apiNotFound("Invalid id");

    const member = await isCommunityMember(id, me!.id);
    if (!member) {
      return apiForbidden("Join this community to see consensus rankings");
    }

    const { searchParams } = new URL(request.url);
    const type = parseType(searchParams.get("type"));
    const range = parseRange(searchParams.get("range"));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10) || 10),
    );
    const offset = Math.max(
      0,
      parseInt(searchParams.get("offset") ?? "0", 10) || 0,
    );

    const { items, hasMore } = await getCommunityConsensusRankings(
      id,
      type,
      range,
      limit,
      offset,
    );
    return apiOk({ items, type, range, limit, offset, hasMore });
  },
  { requireAuth: true },
);
