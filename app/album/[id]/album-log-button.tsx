'use client';

import { useState } from 'react';
import { useReviews } from '@/lib/hooks/use-reviews';
import { ReviewModal } from '@/components/review-modal';
import { useAlbumReviewsContext } from '@/app/album/[id]/album-reviews-context';

interface AlbumLogButtonProps {
  spotifyId: string;
  type: 'song' | 'album';
  spotifyName: string;
  className?: string;
}

export function AlbumLogButton({ spotifyId, type, spotifyName, className = '' }: AlbumLogButtonProps) {
  const [open, setOpen] = useState(false);
  const albumReviews = useAlbumReviewsContext();
  const useReviewsResult = useReviews(type, spotifyId);
  const createReview =
    type === 'album' && albumReviews?.albumId === spotifyId
      ? albumReviews.createReview
      : useReviewsResult.createReview;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-11 items-center justify-center rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 touch-manipulation ${className}`}
      >
        Rate & review
      </button>
      {open && (
        <ReviewModal
          spotifyId={spotifyId}
          type={type}
          spotifyName={spotifyName}
          onClose={() => setOpen(false)}
          onSuccess={() => setOpen(false)}
          createReview={createReview}
        />
      )}
    </>
  );
}
