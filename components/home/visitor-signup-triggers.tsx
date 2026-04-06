"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const STORAGE_DISMISS = "tracklist_visitor_signup_bar_dismissed";
const SCROLL_THRESHOLD = 0.32;

/**
 * Logged-out home: soft signup nudges after scroll depth; records interaction intent
 * (e.g. opening sign-in from the bar) via sessionStorage for analytics-free UX tuning.
 */
export function VisitorSignupTriggers() {
  const [showBar, setShowBar] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(STORAGE_DISMISS) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const evaluateScroll = useCallback(() => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    if (max <= 0) {
      setShowBar(true);
      return;
    }
    const ratio = doc.scrollTop / max;
    if (ratio >= SCROLL_THRESHOLD) setShowBar(true);
  }, []);

  useEffect(() => {
    evaluateScroll();
    window.addEventListener("scroll", evaluateScroll, { passive: true });
    window.addEventListener("resize", evaluateScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", evaluateScroll);
      window.removeEventListener("resize", evaluateScroll);
    };
  }, [evaluateScroll]);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(STORAGE_DISMISS, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }, []);

  const markInteraction = useCallback(() => {
    try {
      sessionStorage.setItem("tracklist_visitor_signup_prompt", "interaction");
    } catch {
      /* ignore */
    }
  }, []);

  if (dismissed || !showBar) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="region"
      aria-label="Sign in prompt"
    >
      <div className="pointer-events-auto flex w-full max-w-lg flex-col gap-3 rounded-2xl border border-zinc-700/90 bg-zinc-950/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="font-medium text-white">Want your own chart?</p>
          <p className="mt-0.5 text-zinc-400">
            Sign in to follow people, post to communities, and get a weekly top 10.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-xl px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-800/80 hover:text-zinc-300"
          >
            Not now
          </button>
          <Link
            href="/auth/signin?callbackUrl=%2F"
            onClick={markInteraction}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/30 transition hover:bg-emerald-500"
          >
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
