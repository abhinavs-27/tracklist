'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

export type CommentUser = { username?: string | null; avatar_url?: string | null } | null;
export type CommentRow = { id: string; content: string; created_at: string; user: CommentUser };

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      <path fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
        d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

type BaseProps = {
  initialCount?: number;
  /** Controlled open state — if omitted, component manages its own. */
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  /** Only render the expansion body, not the toggle button. Use when the button is rendered separately. */
  bodyOnly?: boolean;
};

type Props = BaseProps &
  (
    | { reviewId: string; targetType?: never; targetId?: never }
    | { targetType: 'feed_item' | 'log'; targetId: string; reviewId?: never }
  );

/** Renders ONLY the toggle button — pass this into a flex row. */
export function CommentToggleButton({ open, onToggle, count }: {
  open: boolean;
  onToggle: () => void;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label="Comments"
      aria-expanded={open}
      className={`flex items-center gap-1.5 transition-colors duration-150 ${
        open ? 'text-gold-400' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      <CommentIcon />
      {count > 0 && <span className="min-w-[1ch] text-xs tabular-nums">{count}</span>}
    </button>
  );
}

/** Full comment thread: toggle button + inline expansion. */
export function CommentThread(props: Props) {
  const { data: session, status } = useSession();
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [count, setCount] = useState(props.initialCount ?? 0);
  const [internalOpen, setInternalOpen] = useState(false);
  const open = props.open !== undefined ? props.open : internalOpen;
  const setOpen = (v: boolean) => { setInternalOpen(v); props.onOpenChange?.(v); };

  const [content, setContent] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isReview = 'reviewId' in props && props.reviewId != null;

  const fetchComments = async () => {
    setFetching(true);
    try {
      const url = isReview
        ? `/api/comments?review_id=${props.reviewId}`
        : `/api/feed-comments?target_type=${props.targetType}&target_id=${encodeURIComponent(props.targetId!)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) setComments(data);
    } finally { setFetching(false); }
  };

  useEffect(() => {
    if (open && comments.length === 0 && !fetching) {
      void (async () => {
        await fetchComments();
      })();
    }
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || loading) return;
    setSubmitError(null);
    setLoading(true);
    try {
      const body = isReview
        ? { review_id: props.reviewId, content: content.trim() }
        : { target_type: props.targetType, target_id: props.targetId, content: content.trim() };
      const res = await fetch(isReview ? '/api/comments' : '/api/feed-comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setSubmitError((data?.error as string) ?? 'Failed to post.'); return; }
      setComments((prev) => [...prev, data]);
      setCount((c) => c + 1);
      setContent('');
    } finally { setLoading(false); }
  };

  const bodyOpen = props.bodyOnly ? true : open;

  return (
    <div>
      {!props.bodyOnly && (
        <CommentToggleButton open={open} onToggle={() => setOpen(!open)} count={count} />
      )}
      {bodyOpen && (
        <div className="mt-3 border-t border-zinc-800/60 pt-3">
          {fetching ? (
            <p className="py-1 text-xs text-zinc-600">Loading…</p>
          ) : comments.length === 0 ? (
            <p className="py-1 text-xs text-zinc-600">No comments yet.</p>
          ) : (
            <ul className="space-y-3 pb-3">
              {comments.map((c) => (
                <li key={c.id} className="flex gap-2.5">
                  {c.user?.avatar_url ? (
                    <img src={c.user.avatar_url} alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover" />
                  ) : (
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-medium text-zinc-400">
                      {(c.user?.username ?? '?')[0]?.toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-zinc-300">{c.user?.username ?? 'Unknown'}</span>
                    <span className="ml-2 text-xs leading-relaxed text-zinc-400">{c.content}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {status === 'authenticated' && (
            <form onSubmit={handleSubmit} className="flex items-center gap-2">
              {session?.user?.image && (
                <img src={session.user.image} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
              )}
              <input
                ref={inputRef}
                type="text"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Add a comment…"
                maxLength={500}
                className="min-w-0 flex-1 rounded-lg bg-zinc-800/60 px-3 py-1.5 text-xs text-white placeholder-zinc-600 outline-none ring-1 ring-zinc-700/60 transition focus:ring-gold-500/50"
              />
              <button type="submit" disabled={loading || !content.trim()}
                className="shrink-0 rounded-lg bg-gold-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-gold-500 disabled:opacity-40">
                Post
              </button>
            </form>
          )}
          {submitError && <p className="mt-2 text-xs text-red-400">{submitError}</p>}
        </div>
      )}
    </div>
  );
}
