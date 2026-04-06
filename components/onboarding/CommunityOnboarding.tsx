"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { queryKeys } from "@/lib/query-keys";

const STORAGE_KEY = "tracklist-community-onboarding-dismissed";
/** Same session as finishing profile onboarding (`?welcome=1`); cleared after modal dismiss. */
const WELCOME_SESSION_KEY = "tracklist-community-onboarding-after-welcome";

/** One in-flight recommended fetch per user (avoids Strict Mode double POST in dev). */
const recommendedInflight = new Map<string, Promise<void>>();

type Rec = {
  communityId: string;
  name: string;
  score: number;
  label: string;
  isFallback: boolean;
  memberCount: number;
};

export function CommunityOnboarding() {
  const queryClient = useQueryClient();
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Rec[]>([]);
  const [joining, setJoining] = useState<string | null>(null);

  const isPostOnboardingWelcome = useCallback((): boolean => {
    if (typeof window === "undefined") return false;
    if (searchParams.get("welcome") === "1") return true;
    try {
      return sessionStorage.getItem(WELCOME_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("welcome") !== "1") return;
    try {
      sessionStorage.setItem(WELCOME_SESSION_KEY, "1");
    } catch {
      /* ignore */
    }
  }, [searchParams]);

  const checkAndLoad = useCallback(async () => {
    if (status !== "authenticated" || !session?.user?.id) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY) === "1") return;
    if (!isPostOnboardingWelcome()) return;

    const uid = session.user.id;
    let p = recommendedInflight.get(uid);
    if (p) {
      await p;
      return;
    }

    p = (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/communities/recommended", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          recommendations?: Rec[];
          isNewUser?: boolean;
        };
        const recs = data.recommendations ?? [];
        setItems(recs);
        if (recs.length > 0) {
          setOpen(true);
        } else {
          try {
            sessionStorage.removeItem(WELCOME_SESSION_KEY);
          } catch {
            /* ignore */
          }
        }
      } finally {
        setLoading(false);
      }
    })().finally(() => {
      recommendedInflight.delete(uid);
    });
    recommendedInflight.set(uid, p);
    await p;
  }, [status, session?.user?.id, isPostOnboardingWelcome]);

  useEffect(() => {
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      void checkAndLoad();
    };
    if (typeof requestIdleCallback !== "undefined") {
      idleId = requestIdleCallback(run);
    } else {
      timeoutId = setTimeout(run, 1);
    }
    return () => {
      if (idleId !== undefined) cancelIdleCallback(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [checkAndLoad]);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    try {
      sessionStorage.removeItem(WELCOME_SESSION_KEY);
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  async function join(communityId: string) {
    const previous = items;
    setItems((prev) => prev.filter((x) => x.communityId !== communityId));
    setJoining(communityId);
    try {
      const res = await fetch("/api/communities/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId }),
      });
      if (!res.ok) {
        setItems(previous);
        const j = await res.json().catch(() => ({}));
        alert((j as { error?: string }).error ?? "Could not join");
        return;
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.communitiesMine() });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.recommendedCommunities(),
      });
      setItems((prev) => {
        if (prev.length === 0) dismiss();
        return prev;
      });
    } finally {
      setJoining(null);
    }
  }

  if (status !== "authenticated" || !open || loading) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="community-onboarding-title"
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-xl">
        <h2
          id="community-onboarding-title"
          className="text-xl font-bold text-white"
        >
          Find your people
        </h2>
        <p className="mt-2 text-sm text-zinc-400">
          We matched public communities to your recent listening. Join a few to
          compete on weekly leaderboards.
        </p>

        <ul className="mt-5 space-y-3">
          {items.map((c) => {
            const pct = Math.round(c.score * 100);
            return (
              <li
                key={c.communityId}
                className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-white">{c.name}</p>
                  <p className="text-xs text-zinc-500">
                    {c.isFallback ? (
                      <>
                        {c.label}
                        {c.memberCount > 0 ? ` · ${c.memberCount} members` : ""}
                      </>
                    ) : (
                      <>
                        <span className="font-semibold text-emerald-400">
                          {pct}%
                        </span>
                        {" · "}
                        {c.label}
                      </>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link
                    href={`/communities/${c.communityId}`}
                    className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
                  >
                    View
                  </Link>
                  <button
                    type="button"
                    disabled={joining === c.communityId}
                    onClick={() => join(c.communityId)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {joining === c.communityId ? "…" : "Join"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={dismiss}
            className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            Maybe later
          </button>
          <Link
            href="/communities"
            onClick={dismiss}
            className="rounded-lg bg-zinc-800 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Browse all
          </Link>
        </div>
      </div>
    </div>
  );
}
