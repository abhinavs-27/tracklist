import { getExploreRecentAlbumReviews } from "@/lib/explore-reviews-preview";
import { exploreSectionOrFallback } from "@/lib/explore-section-timeout";
import { ReviewsPreview } from "@/components/explore/reviews-preview";

export async function ExploreReviewsSection() {
  const { reviews } = await exploreSectionOrFallback(
    () => getExploreRecentAlbumReviews(8),
    { reviews: [] },
  );
  return <ReviewsPreview reviews={reviews} />;
}
