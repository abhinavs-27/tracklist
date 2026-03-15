'use client';

import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ReviewCard } from './review-card';
import type { ReviewWithUser } from '@/types';

export type ReviewItem = {
  id: string;
  user_id: string;
  username?: string | null;
  entity_type: string;
  entity_id: string;
  rating: number;
  review_text: string | null;
  created_at: string;
  updated_at: string;
  user?: { id: string; username: string; avatar_url: string | null } | null;
};

const ROW_ESTIMATE = 180;
const OVERSCAN = 2;

interface VirtualReviewListProps {
  reviews: ReviewItem[];
  spotifyName: string;
  /** Max height of scroll container (default 400px). */
  maxHeight?: string;
  className?: string;
}

function toReviewWithUser(r: ReviewItem): ReviewWithUser {
  return {
    id: r.id,
    user_id: r.user_id,
    entity_type: r.entity_type as 'album' | 'song',
    entity_id: r.entity_id,
    rating: r.rating,
    review_text: r.review_text,
    created_at: r.created_at,
    updated_at: r.updated_at,
    user: r.user
      ? { id: r.user.id, username: r.user.username, avatar_url: r.user.avatar_url, email: '', bio: null, created_at: '' }
      : { id: r.user_id, username: r.username ?? '', avatar_url: null, email: '', bio: null, created_at: '' },
  };
}

export function VirtualReviewList({
  reviews,
  spotifyName,
  maxHeight = '400px',
  className = '',
}: VirtualReviewListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: reviews.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE,
    overscan: OVERSCAN,
  });
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div ref={parentRef} className={`overflow-auto ${className}`} style={{ maxHeight }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const review = reviews[virtualRow.index];
          const reviewWithUser = toReviewWithUser(review);
          return (
            <div
              key={review.id}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              className="pb-3"
            >
              <ReviewCard review={reviewWithUser} spotifyName={spotifyName} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
