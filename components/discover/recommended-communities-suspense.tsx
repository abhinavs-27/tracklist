import { Suspense } from "react";
import { getRecommendedCommunities } from "@/lib/community/getRecommendedCommunities";
import { isSocialInboxAndMusicRecUiEnabled } from "@/lib/feature-social-music-rec-ui";
import { RecommendedCommunitiesSection } from "@/components/discover/recommended-communities-section";

async function RecommendedCommunitiesLoader({
  userId,
  title,
  showBrowseAll,
}: {
  userId: string;
  title?: string;
  showBrowseAll?: boolean;
}) {
  if (!isSocialInboxAndMusicRecUiEnabled()) return null;
  const items = await getRecommendedCommunities(userId);
  if (items.length === 0) return null;
  return (
    <RecommendedCommunitiesSection
      items={items}
      title={title}
      showBrowseAll={showBrowseAll}
    />
  );
}

/**
 * Loads taste-based community recommendations in a separate server render so the rest
 * of the page (feed, discover rails, etc.) is not blocked on this expensive query.
 */
export function RecommendedCommunitiesSuspense(props: {
  userId: string;
  title?: string;
  showBrowseAll?: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <RecommendedCommunitiesLoader {...props} />
    </Suspense>
  );
}
