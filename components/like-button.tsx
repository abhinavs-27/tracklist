'use client';

import { useState } from 'react';

interface LikeButtonProps {
  logId: string;
  initialLiked: boolean;
  initialCount: number;
}

export function LikeButton({ logId, initialLiked, initialCount }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    const nextLiked = !liked;
    setLiked(nextLiked);
    setCount((c) => c + (nextLiked ? 1 : -1));
    try {
      const res = await fetch(nextLiked ? '/api/likes' : `/api/likes?log_id=${logId}`, {
        method: nextLiked ? 'POST' : 'DELETE',
        headers: nextLiked ? { 'Content-Type': 'application/json' } : undefined,
        body: nextLiked ? JSON.stringify({ log_id: logId }) : undefined,
      });
      if (!res.ok) {
        setLiked(!nextLiked);
        setCount((c) => c - (nextLiked ? 1 : -1));
      }
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
      aria-pressed={liked}
    >
      <span className={liked ? 'text-red-400' : ''}>{liked ? '♥' : '♡'}</span>
      <span>{count}</span>
    </button>
  );
}
