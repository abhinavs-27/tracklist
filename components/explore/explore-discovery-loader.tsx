import { getExploreDiscoveryBundle } from "@/lib/explore-discovery-data";
import { ExploreDiscoveryFeedClient } from "@/components/explore/explore-discovery-feed-client";

export async function ExploreDiscoveryLoader() {
  let initial = null;
  try {
    initial = await getExploreDiscoveryBundle("week");
  } catch {
    initial = null;
  }
  return <ExploreDiscoveryFeedClient initial={initial} />;
}
