'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/toast';
import { queryKeys } from '@/lib/query-keys';

interface LikeButtonProps {
  reviewId: string;
  initialLiked: boolean;
  initialCount: number;
}

export function LikeButton({ reviewId, initialLiked, initialCount }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const queryClient = useQueryClient();

  useEffect(() => {
    setLiked(initialLiked);
    setCount(initialCount);
  }, [initialLiked, initialCount]);
  const { toast } = useToast();

  const likeMutation = useMutation({
    mutationFn: async (nextLiked: boolean) => {
      const res = await fetch(
        nextLiked ? '/api/likes' : `/api/likes?review_id=${reviewId}`,
        {
          method: nextLiked ? 'POST' : 'DELETE',
          headers: nextLiked ? { 'Content-Type': 'application/json' } : undefined,
          body: nextLiked ? JSON.stringify({ review_id: reviewId }) : undefined,
        }
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
      toast("Couldn’t save your like. Try again.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reviewsPrefix() });
    },
  });

  const handleClick = () => {
    if (likeMutation.isPending) return;
    likeMutation.mutate(!liked);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={likeMutation.isPending}
      className="flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-white disabled:opacity-50"
      aria-label="Like"
      aria-pressed={liked}
    >
      <span className={liked ? 'text-red-400' : ''}>{liked ? '♥' : '♡'}</span>
      <span>{count}</span>
    </button>
  );
}
