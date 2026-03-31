'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/toast';
import { queryKeys } from '@/lib/query-keys';

interface FollowButtonProps {
  userId: string;
  initialFollowing: boolean;
  onFollowChange?: (isFollowing: boolean) => void;
}

export function FollowButton({ userId, initialFollowing, onFollowChange }: FollowButtonProps) {
  const [following, setFollowing] = useState(initialFollowing);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const followMutation = useMutation({
    mutationFn: async (nextFollowing: boolean) => {
      if (nextFollowing) {
        const res = await fetch('/api/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ following_id: userId }),
        });
        if (!res.ok) throw new Error('Follow failed');
      } else {
        const res = await fetch(`/api/follow?following_id=${encodeURIComponent(userId)}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error('Unfollow failed');
      }
    },
    onMutate: (nextFollowing) => {
      setFollowing(nextFollowing);
      onFollowChange?.(nextFollowing);
    },
    onError: (_err, nextFollowing) => {
      setFollowing(!nextFollowing);
      onFollowChange?.(!nextFollowing);
      toast("Couldn’t update follow. Try again.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.profile(userId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.discover() });
    },
  });

  const handleClick = () => {
    followMutation.mutate(!following);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={followMutation.isPending}
      className={`inline-flex min-h-11 items-center justify-center rounded-full px-4 py-2.5 text-sm font-medium transition touch-manipulation ${
        following
          ? 'border border-zinc-600 bg-transparent text-zinc-300 hover:border-zinc-500'
          : 'bg-emerald-600 text-white hover:bg-emerald-500'
      } disabled:opacity-50`}
    >
      {followMutation.isPending ? '...' : following ? 'Following' : 'Follow'}
    </button>
  );
}
