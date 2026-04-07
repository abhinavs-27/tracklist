'use client';

import { useState } from 'react';
import { StarRatingInput } from '@/components/ui/star-rating';

export type CreateReviewPayload = {
  rating: number;
  review_text: string | null;
};

interface ReviewModalProps {
  spotifyId: string;
  type: 'song' | 'album';
  spotifyName: string;
  onClose: () => void;
  onSuccess: () => void;
  /** From useReviews hook – modal must not call queryClient.setQueryData or invalidateQueries */
  createReview: (payload: CreateReviewPayload) => Promise<unknown>;
}

export function ReviewModal({ spotifyName, onClose, onSuccess, createReview }: ReviewModalProps) {
  const [rating, setRating] = useState(3);
  const [reviewText, setReviewText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await createReview({
        rating,
        review_text: reviewText.trim() || null,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save review');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-modal-title"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/95 p-6 shadow-xl shadow-black/40 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="review-modal-title" className="text-xl font-semibold text-white">
          Rate & review
        </h2>
        <p className="mt-1 text-sm text-zinc-400 line-clamp-2" title={spotifyName}>
          {spotifyName}
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-300">Rating</label>
            <StarRatingInput value={rating} onChange={setRating} disabled={loading} />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-300">Review (optional)</label>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              placeholder="What did you think?"
            />
          </div>
          {error && <p className="text-sm text-red-400" role="status">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-900/60 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {loading ? 'Saving...' : 'Save review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
