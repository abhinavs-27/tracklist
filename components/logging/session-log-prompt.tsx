"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/toast";
import { useLogging } from "./logging-context";
import { useRecentViews } from "./recent-views-provider";

const LAST_PROMPT_KEY = "tracklist:session_log_last_prompt_web_v1";
const INTERVAL_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 3 * 60 * 1000;
const MAX_SUGGESTIONS = 5;

function getLastPrompt(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem(LAST_PROMPT_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function setLastPrompt(ts: number): void {
  try {
    localStorage.setItem(LAST_PROMPT_KEY, String(ts));
  } catch {
    /* ignore */
  }
}

export function SessionLogPrompt() {
  const { data: session } = useSession();
  const { items } = useRecentViews();
  const { logListen, logBusy } = useLogging();
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const visRef = useRef<"visible" | "hidden" | "prerender">("visible");

  useEffect(() => {
    visRef.current =
      typeof document !== "undefined" ? document.visibilityState : "visible";
  }, []);

  const maybeOpen = useCallback(() => {
    if (!session?.user?.id) return;
    const last = getLastPrompt();
    const now = Date.now();
    if (last === 0) {
      setLastPrompt(now);
      return;
    }
    if (now - last < COOLDOWN_MS) return;
    const slice = items.slice(0, MAX_SUGGESTIONS);
    if (slice.length === 0) return;
    setVisible(true);
  }, [items, session?.user?.id]);

  useEffect(() => {
    const id = window.setInterval(() => {
      maybeOpen();
    }, INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [maybeOpen]);

  useEffect(() => {
    const onVis = () => {
      const prev = visRef.current;
      visRef.current = document.visibilityState;
      if (
        (prev === "hidden" || prev === "prerender") &&
        document.visibilityState === "visible"
      ) {
        maybeOpen();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [maybeOpen]);

  useEffect(() => {
    if (visible && items.length === 0) setVisible(false);
  }, [visible, items.length]);

  async function dismiss() {
    setVisible(false);
    setLastPrompt(Date.now());
  }

  async function onLogChip(item: (typeof items)[number]) {
    if (logBusy) return;
    try {
      await logListen({
        trackId: item.trackId,
        albumId: item.albumId ?? null,
        artistId: item.artistId ?? null,
        source: "session",
        displayName: item.title,
      });
      await dismiss();
    } catch {
      toast("Couldn’t log. Try again.");
    }
  }

  if (!visible || !session?.user?.id) return null;

  const slice = items.slice(0, MAX_SUGGESTIONS);

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/55 p-5">
      <div
        className="max-h-[min(90vh,520px)] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-log-title"
      >
        <h2 id="session-log-title" className="text-lg font-extrabold text-white">
          You&apos;ve been exploring music
        </h2>
        <p className="mt-1.5 text-sm font-semibold text-zinc-400">
          Log a recent listen?
        </p>
        <ul className="mt-4 space-y-2.5">
          {slice.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              <button
                type="button"
                disabled={logBusy}
                onClick={() => void onLogChip(item)}
                className="flex w-full items-center gap-3 rounded-lg py-2 text-left transition hover:bg-zinc-800/80 disabled:opacity-60"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-zinc-800">
                  {item.artworkUrl ? (
                    <img
                      src={item.artworkUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-zinc-600">
                      ♪
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">
                    {item.title}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-zinc-500">
                    {item.subtitle}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-extrabold text-emerald-400">
                  Log
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => void dismiss()}
          className="mt-4 w-full py-2.5 text-center text-[15px] font-bold text-zinc-400 hover:text-zinc-300"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
