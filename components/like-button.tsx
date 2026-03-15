'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';

interface LikeButtonProps {
  reviewId: string;
  initialLiked: boolean;
  initialCount: number;
}

export function LikeButton({ reviewId, initialLiked, initialCount }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleClick = async () => {
    if (loading) return;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((c) => c + (nextLiked ? 1 : -1));
    setLoading(true);
    try {
      const res = await fetch(nextLiked ? '/api/likes' : `/api/likes?review_id=${reviewId}`, {
        method: nextLiked ? 'POST' : 'DELETE',
        headers: nextLiked ? { 'Content-Type': 'application/json' } : undefined,
        body: nextLiked ? JSON.stringify({ review_id: reviewId }) : undefined,
      });
      if (!res.ok) {
        setLiked(!nextLiked);
        setCount((c) => c - (nextLiked ? 1 : -1));
        toast('Action failed, please try again.');
      }
    } catch {
      setLiked(!nextLiked);
      setCount((c) => c - (nextLiked ? 1 : -1));
      toast('Action failed, please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-white disabled:opacity-50"
      aria-label="Like"
      aria-pressed={liked}
    >
      <span className={liked ? 'text-red-400' : ''}>{liked ? '♥' : '♡'}</span>
      <span>{count}</span>
    </button>
  );
}
