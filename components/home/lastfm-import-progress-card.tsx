"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LastfmImportStatus, LastfmImportProgress } from "@/app/api/lastfm/import-status/route";

type Props = {
  initialStatus: LastfmImportStatus;
  initialProgress: LastfmImportProgress;
};

const POLL_INTERVAL_MS = 5000;
const AUTO_DISMISS_MS = 8000;

function formatCount(n?: number): string {
  if (n == null) return "";
  return n.toLocaleString();
}

export function LastfmImportProgressCard({ initialStatus, initialProgress }: Props) {
  const [status, setStatus] = useState<LastfmImportStatus>(initialStatus);
  const [progress, setProgress] = useState<LastfmImportProgress>(initialProgress);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/lastfm/import-status");
      if (!res.ok) return;
      const body = await res.json() as { data: { status: LastfmImportStatus; progress: LastfmImportProgress } };
      setStatus(body.data.status);
      setProgress(body.data.progress ?? {});
    } catch { /* ignore network errors */ }
  }, []);

  useEffect(() => {
    if (status !== "pending" && status !== "running") return;
    const id = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [status, poll]);

  useEffect(() => {
    if (status !== "done") return;
    timerRef.current = setTimeout(() => setDismissed(true), AUTO_DISMISS_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [status]);

  if (!status || dismissed) return null;

  const retry = async () => {
    await fetch("/api/lastfm/full-import", { method: "POST" });
    setStatus("pending");
    setProgress({});
  };

  const isActive = status === "pending" || status === "running";
  const isDone = status === "done";

  let message: React.ReactNode;
  if (status === "pending") {
    message = "Your Last.fm history is queued for import…";
  } else if (status === "running") {
    const added = formatCount(progress.logsAdded);
    const pages = progress.pagesTotal != null
      ? `(page ${progress.pagesDone ?? 0} of ${progress.pagesTotal})`
      : "…";
    message = added
      ? `Importing your Last.fm history — ${added} plays added so far ${pages}`
      : "Importing your Last.fm history…";
  } else if (isDone) {
    const added = formatCount(progress.logsAdded);
    message = `Import complete${added ? ` — ${added} plays added` : ""}. Your charts and taste profile are updating.`;
  } else {
    message = (
      <>
        Import hit an error.{" "}
        <button type="button" onClick={() => void retry()} className="underline hover:no-underline">
          Retry
        </button>
      </>
    );
  }

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
      isDone
        ? "border-green-800/50 bg-green-950/40 text-green-300"
        : isActive
        ? "border-zinc-700 bg-zinc-900 text-zinc-300"
        : "border-red-800/50 bg-red-950/40 text-red-300"
    }`}>
      {isActive && (
        <span className="mt-0.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-gold-400" />
      )}
      <p className="flex-1 leading-snug">{message}</p>
      {(isDone || status === "failed" || status === "stalled") && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 text-xs opacity-50 hover:opacity-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}
