import type { ReactNode } from "react";
import { getExploreDiscoveryBundle } from "@/lib/explore-discovery-data";
import { ExploreDiscoveryFeedClient } from "@/components/explore/explore-discovery-feed-client";

export async function ExploreDiscoveryLoader({ risingArtistsSlot }: { risingArtistsSlot?: ReactNode } = {}) {
  let initial = null;
  try {
    initial = await getExploreDiscoveryBundle("week");
  } catch {
    initial = null;
  }
  return <ExploreDiscoveryFeedClient initial={initial} risingArtistsSlot={risingArtistsSlot} />;
}
