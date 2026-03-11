'use client';

import { useState } from 'react';

interface ReviewModalProps {
  spotifyId: string;
  type: 'song' | 'album';
  spotifyName: string;
  onClose: () => void;
  onSuccess: () => void;
}


export function ReviewModal({ spotifyId, type, spotifyName, onClose, onSuccess }: ReviewModalProps) {
  const [rating, setRating] = useState(3);
  const [review, setReview] = useState('');
  const [listenedAt, setListenedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spotify_id: spotifyId,
          type,
          title: spotifyName,
          rating,
          review: review.trim() || null,
          listened_at: new Date(listenedAt).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to create log');
        return;
      }
      onSuccess();
      onClose();
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
          Log listen
        </h2>
        <p className="mt-1 text-sm text-zinc-400 line-clamp-2" title={spotifyName}>
          {spotifyName}
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-300">Rating</label>
            <div className="flex gap-1" aria-label="Select rating from 1 to 5 stars">
              {[1, 2, 3, 4, 5].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRating(r)}
                  className={`rounded px-2 py-1 text-lg transition focus:outline-none focus:ring-2 focus:ring-emerald-400/70 ${
                    rating >= r ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                  aria-label={`${r} star${r > 1 ? 's' : ''}`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-300">Listen date</label>
            <input
              type="date"
              value={listenedAt}
              onChange={(e) => setListenedAt(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-sm font-medium text-zinc-300">Review (optional)</label>
            <textarea
              value={review}
              onChange={(e) => setReview(e.target.value)}
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
              {loading ? 'Saving...' : 'Save log'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
