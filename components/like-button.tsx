'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/toast';
import { queryKeys } from '@/lib/query-keys';

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      {filled ? (
        <path
          fill="currentColor"
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
        />
      ) : (
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
        />
      )}
    </svg>
  );
}

interface LikeButtonProps {
  reviewId: string;
  initialLiked: boolean;
  initialCount: number;
}

export function LikeButton({ reviewId, initialLiked, initialCount }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [popped, setPopped] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    setLiked(initialLiked);
    setCount(initialCount);
  }, [initialLiked, initialCount]);

  const likeMutation = useMutation({
    mutationFn: async (nextLiked: boolean) => {
      const res = await fetch(
        nextLiked ? '/api/likes' : `/api/likes?review_id=${reviewId}`,
        {
          method: nextLiked ? 'POST' : 'DELETE',
          headers: nextLiked ? { 'Content-Type': 'application/json' } : undefined,
          body: nextLiked ? JSON.stringify({ review_id: reviewId }) : undefined,
        },
      );
      if (!res.ok) throw new Error('Like failed');
    },
    onMutate: (nextLiked) => {
      setLiked(nextLiked);
      setCount((c) => c + (nextLiked ? 1 : -1));
    },
    onError: (_err, nextLiked) => {
      setLiked(!nextLiked);
      setCount((c) => c - (nextLiked ? 1 : -1));
      toast("Couldn't save your like. Try again.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reviewsPrefix() });
    },
  });

  const handleClick = () => {
    if (likeMutation.isPending) return;
    if (!liked) {
      setPopped(true);
      setTimeout(() => setPopped(false), 200);
    }
    likeMutation.mutate(!liked);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={likeMutation.isPending}
      aria-label={liked ? 'Unlike' : 'Like'}
      aria-pressed={liked}
      className={`flex items-center gap-1.5 transition-all duration-150 disabled:opacity-40 ${
        liked ? 'text-rose-500' : 'text-zinc-500 hover:text-rose-400'
      } ${popped ? 'scale-125' : 'scale-100'}`}
    >
      <HeartIcon filled={liked} />
      {count > 0 && (
        <span className="min-w-[1ch] text-xs tabular-nums">{count}</span>
      )}
    </button>
  );
}
