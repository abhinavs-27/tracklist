import { ReviewCard } from './review-card';
import type { ReviewWithUser } from '@/types';

interface FeedItemProps {
  review: ReviewWithUser;
  spotifyName?: string;
}

export function FeedItem({ review, spotifyName }: FeedItemProps) {
  return <ReviewCard review={review} spotifyName={spotifyName} />;
}
