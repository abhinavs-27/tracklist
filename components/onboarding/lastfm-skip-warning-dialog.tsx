"use client";

import { useEffect } from "react";

type Props = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Shown when the user skips Last.fm setup — explains that listens won’t sync automatically.
 */
export function LastfmSkipWarningDialog({
  open,
  onCancel,
  onConfirm,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => onCancel()}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-red-900/50 border-b-0 bg-zinc-950 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 shadow-2xl ring-1 ring-red-950/30 sm:rounded-2xl sm:border-b sm:p-6"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lastfm-skip-warning-title"
        aria-describedby="lastfm-skip-warning-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-red-900/50 bg-red-950/60">
          <svg
            className="h-6 w-6 text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>
        <h2
          id="lastfm-skip-warning-title"
          className="text-center text-lg font-semibold tracking-tight text-white sm:text-left"
        >
          Without Last.fm, listens won&apos;t sync automatically
        </h2>
        <p
          id="lastfm-skip-warning-desc"
          className="mt-2 text-center text-sm leading-relaxed text-zinc-400 sm:text-left"
        >
          Tracklist imports your plays from Last.fm (after you connect Spotify
          there). If you skip this, we won&apos;t automatically pull your
          listening history — you can still log manually, but feeds, communities,
          and stats that rely on your real plays will stay empty or out of date
          until you connect Last.fm from your profile.
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button
            type="button"
            onClick={() => onConfirm()}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-800/80 bg-red-950/50 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:border-red-700 hover:bg-red-950/80 sm:order-2"
          >
            I understand — continue without Last.fm
          </button>
          <button
            type="button"
            onClick={() => onCancel()}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-emerald-500 sm:order-1"
          >
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
