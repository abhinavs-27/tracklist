import { withHandler } from "@/lib/api-handler";
import { getExploreHubPayload } from "@/lib/explore-hub-data";
import { apiInternalError, apiOk } from "@/lib/api-response";
import { exploreLogLine } from "@/lib/explore-perf";

export const GET = withHandler(async () => {
  const start = Date.now();
  exploreLogLine("explore: start");

  try {
    const payload = await getExploreHubPayload();
    exploreLogLine(`explore: total: ${Date.now() - start} ms`);

    return apiOk(payload);
  } catch (e) {
    return apiInternalError(e);
  }
});
