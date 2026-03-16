"use client";

import { ReviewsSectionWithData } from "@/components/reviews-section-with-data";

type AlbumReviewsProps = {
  albumId: string;
  albumName: string;
};

/** Renders reviews section; ReviewsSectionWithData calls useReviews('album', albumId) so it subscribes to the same cache the modal updates. */
export function AlbumReviews({ albumId, albumName }: AlbumReviewsProps) {
  return (
    <ReviewsSectionWithData
      entityType="album"
      entityId={albumId}
      spotifyName={albumName}
    />
  );
}
