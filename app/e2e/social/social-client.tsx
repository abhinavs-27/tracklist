'use client';

import { ReviewCard } from '@/components/review-card';
import type { ReviewWithUser } from '@/types';

const demoReview: ReviewWithUser = {
  id: 'review_demo_1',
  user_id: 'user_demo_1',
  entity_type: 'album',
  entity_id: '2nLhD10Z7Sb4RFyCX2ZCyx',
  rating: 4,
  review_text: 'Great record.',
  created_at: new Date('2026-01-02T00:00:00.000Z').toISOString(),
  updated_at: new Date('2026-01-02T00:00:00.000Z').toISOString(),
  user: {
    id: 'user_demo_1',
    email: 'alice@example.com',
    username: 'alice',
    avatar_url: null,
    bio: null,
    created_at: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  },
};

export function E2ESocialClient() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-white">E2E Social</h1>
      <ReviewCard review={demoReview} spotifyName="Demo Album" />
    </div>
  );
}
