'use client';

import { useState } from 'react';
import { useToast } from '@/components/toast';

interface FollowButtonProps {
  userId: string;
  initialFollowing: boolean;
  onFollowChange?: (isFollowing: boolean) => void;
}

export function FollowButton({ userId, initialFollowing, onFollowChange }: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleClick = async () => {
    const nextFollowing = !following;
    setFollowing(nextFollowing);
    onFollowChange?.(nextFollowing);

    setLoading(true);
    try {
      if (nextFollowing) {
        const res = await fetch('/api/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ following_id: userId }),
        });
        if (!res.ok) {
          setFollowing(false);
          onFollowChange?.(false);
          toast('Action failed, please try again.');
        }
      } else {
        const res = await fetch(`/api/follow?following_id=${encodeURIComponent(userId)}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          setFollowing(true);
          onFollowChange?.(true);
          toast('Action failed, please try again.');
        }
      }
    } catch {
      setFollowing(!nextFollowing);
      onFollowChange?.(!nextFollowing);
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
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        following
          ? 'border border-zinc-600 bg-transparent text-zinc-300 hover:border-zinc-500'
          : 'bg-emerald-600 text-white hover:bg-emerald-500'
      } disabled:opacity-50`}
    >
      {loading ? '...' : following ? 'Following' : 'Follow'}
    </button>
  );
}
