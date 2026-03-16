"use client";

import { ReviewsSectionWithData } from "@/components/reviews-section-with-data";
import type { ReviewsResponse } from "@/lib/hooks/use-reviews";

export type { ReviewItem, ReviewsResponse } from "@/lib/hooks/use-reviews";

type EntityReviewsSectionProps = {
  entityType: "album" | "song";
  entityId: string;
  spotifyName: string;
  initialData?: ReviewsResponse | null;
};

/** Renders reviews section; ReviewsSectionWithData calls useReviews so it subscribes directly to the query. */
export function EntityReviewsSection({
  entityType,
  entityId,
  spotifyName,
  initialData,
}: EntityReviewsSectionProps) {
  return (
    <ReviewsSectionWithData
      entityType={entityType}
      entityId={entityId}
      spotifyName={spotifyName}
      initialData={initialData}
    />
  );
}
