"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

type CommentRow = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  user?: { username?: string | null } | null;
};

/** Community-only thread (separate from global `comments` on reviews). */
export function CommunityFeedCommentThread(props: {
  communityId: string;
  targetType: "review" | "log" | "feed_item";
  targetId: string;
  initialCount?: number;
}) {
  const { status } = useSession();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [count, setCount] = useState(props.initialCount ?? 0);
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  const base = `/api/communities/${encodeURIComponent(props.communityId)}/activity-comments`;

  const fetchComments = useCallback(async () => {
    setFetching(true);
    try {
      const q = new URLSearchParams({
        target_type: props.targetType,
        target_id: props.targetId,
      });
      const res = await fetch(`${base}?${q.toString()}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setComments(data);
        setCount(data.length);
      }
    } finally {
      setFetching(false);
    }
  }, [base, props.targetType, props.targetId]);

  useEffect(() => {
    if (open && comments.length === 0 && !fetching) {
      void fetchComments();
    }
  }, [open, comments.length, fetching, fetchComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || loading) return;
    setSubmitError(null);
    setLoading(true);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_type: props.targetType,
          target_id: props.targetId,
          content: content.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError((data?.error as string) ?? "Failed to post comment.");
        return;
      }
      const row = data as CommentRow & { user?: CommentRow["user"] };
      setComments((prev) => [...prev, row]);
      setCount((c) => c + 1);
      setContent("");
    } finally {
      setLoading(false);
    }
  };

  const isSignedIn = status === "authenticated";

  return (
    <div className="relative mt-2 border-t border-zinc-800 pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm text-zinc-400 transition hover:text-white"
      >
        <span>💬</span>
        <span>{count}</span>
        <span className="text-xs text-zinc-600">· community</span>
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-zinc-700 bg-zinc-950/80 p-3">
          <div className="max-h-48 space-y-2 overflow-y-auto">
            {fetching ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : comments.length === 0 ? (
              <p className="text-sm text-zinc-500">No comments yet.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="flex gap-2 text-sm">
                  <span className="shrink-0 font-medium text-zinc-300">
                    {c.user?.username ?? "Unknown"}
                  </span>
                  <span className="text-zinc-400">{c.content}</span>
                </div>
              ))
            )}
          </div>
          {isSignedIn && (
            <form onSubmit={handleSubmit} className="mt-3 flex flex-wrap gap-2">
              <input
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Add a community comment…"
                className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loading || !content.trim()}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Post
              </button>
              {submitError ? (
                <p className="w-full text-sm font-medium text-red-400">
                  {submitError}
                </p>
              ) : null}
            </form>
          )}
          {!isSignedIn ? (
            <p className="mt-2 text-xs text-zinc-500">Sign in to comment.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
