"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import {
  threadKindUi,
  type ThreadKindUiKey,
} from "@/lib/social/thread-kind-ui";

const MAX_NOTE_LEN = 500;

export function ThreadReplyForm({
  threadId,
  threadKind,
}: {
  threadId: string;
  threadKind: ThreadKindUiKey;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ui = threadKindUi(threadKind);

  const submit = useCallback(async () => {
    const text = body.trim();
    if (!text || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/social/threads/${threadId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: text }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Could not send");
        return;
      }
      setBody("");
      router.refresh();
    } catch {
      setError("Could not send");
    } finally {
      setPending(false);
    }
  }, [body, pending, router, threadId]);

  return (
    <div className="mt-6 border-t border-white/[0.06] pt-5">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={MAX_NOTE_LEN}
        placeholder={ui.replyPlaceholder}
        className="w-full resize-none rounded-xl border border-white/[0.08] bg-zinc-950/50 px-3.5 py-3 text-sm leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-500/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        aria-label="Short note"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="tabular-nums text-xs text-zinc-600">
          {body.length}/{MAX_NOTE_LEN}
        </span>
        <button
          type="button"
          disabled={pending || !body.trim()}
          onClick={() => void submit()}
          className="rounded-xl bg-emerald-600/90 px-4 py-2 text-sm font-medium text-white shadow-sm ring-1 ring-emerald-400/30 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending ? "Sending…" : "Send note"}
        </button>
      </div>
      {error ? (
        <p className="mt-1 text-[11px] text-rose-400/90" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
