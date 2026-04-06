import { getExploreTrendingPayload } from "@/lib/explore-hub-data";
import { exploreSectionOrFallback } from "@/lib/explore-section-timeout";
import { TrendingStrip } from "@/components/explore/trending-strip";

export async function ExploreTrendingSection() {
  const { trending } = await exploreSectionOrFallback(
    () => getExploreTrendingPayload(),
    { trending: [] },
  );
  return <TrendingStrip items={trending} />;
}
