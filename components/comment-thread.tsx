'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import type { CommentWithUser } from '@/types';

interface CommentThreadProps {
  reviewId: string;
  initialCount: number;
}

export function CommentThread({ reviewId, initialCount }: CommentThreadProps) {
  const { status } = useSession();
  const [comments, setComments] = useState<CommentWithUser[]>([]);
  const [count, setCount] = useState(initialCount);
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  const fetchComments = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch(`/api/comments?review_id=${reviewId}`);
      const data = await res.json();
      if (Array.isArray(data)) setComments(data);
    } finally {
      setFetching(false);
    }
  }, [reviewId]);

  useEffect(() => {
    if (open && comments.length === 0 && !fetching) {
      fetchComments();
    }
  }, [open, comments.length, fetching, fetchComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_id: reviewId, content: content.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setComments((prev) => [...prev, data]);
        setCount((c) => c + 1);
        setContent('');
      }
    } finally {
      setLoading(false);
    }
  };

  const isSignedIn = status === 'authenticated';

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-white"
      >
        <span>💬</span>
        <span>{count}</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-10 mt-2 rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-xl md:left-auto md:right-0 md:min-w-[320px]">
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {fetching ? (
              <p className="text-sm text-zinc-500">Loading...</p>
            ) : comments.length === 0 ? (
              <p className="text-sm text-zinc-500">No comments yet.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="flex gap-2 text-sm">
                  <span className="font-medium text-zinc-300">{c.user?.username ?? 'Unknown'}</span>
                  <span className="text-zinc-400">{c.content}</span>
                </div>
              ))
            )}
          </div>
          {isSignedIn && (
            <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
              <input
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !content.trim()}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Post
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
