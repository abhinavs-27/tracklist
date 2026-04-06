import { withHandler } from "@/lib/api-handler";
import { apiInternalError } from "@/lib/api-response";
import {
  getExploreMostLoved,
  exploreRangeToRpc,
  type ExploreRangeParam,
} from "@/lib/explore-discovery-data";
import { exploreLogLine } from "@/lib/explore-perf";
import {
  STALE_FIRST_STALE_AFTER_SEC,
  STALE_FIRST_TTL_SEC,
  staleFirstApiOk,
} from "@/lib/cache/stale-first-cache";

function parseRange(raw: string | null): ExploreRangeParam {
  const s = raw?.trim().toLowerCase();
  if (s === "24h" || s === "day") return "24h";
  return "week";
}

export const GET = withHandler(async (request) => {
  const start = Date.now();
  exploreLogLine("explore/most-loved: start");
  const bypassCache = request.nextUrl.searchParams.get("refresh") === "1";
  const range = parseRange(request.nextUrl.searchParams.get("range"));

  try {
    const res = await staleFirstApiOk(
      `explore:most-loved:${exploreRangeToRpc(range)}:v1`,
      STALE_FIRST_TTL_SEC.exploreDiscoverySection,
      STALE_FIRST_STALE_AFTER_SEC.exploreDiscoverySection,
      async () => ({ items: await getExploreMostLoved(range, 24) }),
      { bypassCache },
    );
    exploreLogLine(`explore/most-loved: done: ${Date.now() - start} ms`);
    return res;
  } catch (e) {
    return apiInternalError(e);
  }
});
