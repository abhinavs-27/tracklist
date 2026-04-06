"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { BillboardDropHighlights } from "@/lib/billboard-drop/billboard-drop-types";

function movementLabel(delta: number | null): string | null {
  if (delta == null) return null;
  if (delta === 0) return "Same rank";
  if (delta > 0) return `↑ ${delta} spot${delta === 1 ? "" : "s"}`;
  return `↓ ${Math.abs(delta)} spot${Math.abs(delta) === 1 ? "" : "s"}`;
}

async function postAction(
  action: "dismiss_modal" | "complete_flow" | "ack_chart_view",
  weekStart?: string,
): Promise<boolean> {
  try {
    const res = await fetch("/api/me/billboard-drop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, week_start: weekStart ?? null }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function BillboardDropModal({
  highlights,
  communityCount,
  onDismissed,
  onCompleted,
}: {
  highlights: BillboardDropHighlights;
  communityCount: number;
  onDismissed: () => void;
  onCompleted: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);

  const dismiss = useCallback(async () => {
    setBusy(true);
    await postAction("dismiss_modal");
    setBusy(false);
    onDismissed();
  }, [onDismissed]);

  const finish = useCallback(async () => {
    setBusy(true);
    await postAction("complete_flow");
    setBusy(false);
    onCompleted();
    router.push("/communities");
  }, [onCompleted, router]);

  const goNext = useCallback(() => {
    setStep((s) => Math.min(s + 1, 2));
  }, []);

  return (
    <motion.div
      role="dialog"
      aria-modal
      aria-labelledby="billboard-drop-title"
      className="fixed inset-0 z-[210] flex items-center justify-center p-4 sm:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <button
        type="button"
        aria-label="Close"
        disabled={busy}
        onClick={() => void dismiss()}
        className="absolute inset-0 cursor-pointer bg-black/75 backdrop-blur-md transition hover:bg-black/70"
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(251,191,36,0.12),_transparent_55%)]" />

      <div className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-b from-zinc-900 via-zinc-950 to-black shadow-[0_32px_120px_-24px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/[0.06]">
        <div className="flex items-center justify-end border-b border-white/[0.06] px-3 py-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void dismiss()}
            className="pointer-events-auto rounded-full px-3 py-1.5 text-sm font-medium text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-300"
          >
            Skip
          </button>
        </div>

        <div className="pointer-events-auto min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-2 sm:px-8 sm:pb-10 sm:pt-4">
          <div className="mb-6 flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition ${
                  i <= step ? "bg-amber-400" : "bg-zinc-800"
                }`}
              />
            ))}
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {step === 0 ? (
              <motion.div
                key="s0"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-6"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-200/80">
                  New this week
                </p>
                <h2
                  id="billboard-drop-title"
                  className="text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl"
                >
                  Your Weekly Chart Is In
                </h2>
                <p className="text-lg text-zinc-400">{highlights.weekLabel}</p>
                <p className="text-sm leading-relaxed text-zinc-500">
                  Every Sunday we seal your top tracks. Here's your moment
                  before you dive into the full board.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={goNext}
                  className="w-full rounded-2xl bg-amber-500 py-3.5 text-base font-semibold text-zinc-950 shadow-lg shadow-amber-950/35 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  View Your Chart
                </button>
              </motion.div>
            ) : null}

            {step === 1 ? (
              <motion.div
                key="s1"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-6"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-200/80">
                  Highlights
                </p>
                <h3 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  At a glance
                </h3>

                <div className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.03] p-5 ring-1 ring-inset ring-white/[0.04]">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      #1 track
                    </p>
                    <p className="mt-1 text-xl font-semibold text-white">
                      {highlights.numberOneTitle}
                    </p>
                    {highlights.numberOneArtist ? (
                      <p className="text-sm text-zinc-400">
                        {highlights.numberOneArtist}
                      </p>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-white/[0.06] pt-4">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        New entries
                      </p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
                        {highlights.newEntriesCount}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Weeks at #1
                      </p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-white">
                        {highlights.weeksAtNumberOne}
                      </p>
                    </div>
                  </div>

                  {highlights.biggestMoverTitle && movementLabel(highlights.biggestMoverDelta) ? (
                    <div className="border-t border-white/[0.06] pt-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        Biggest move
                      </p>
                      <p className="mt-1 flex flex-wrap items-baseline gap-2">
                        <span className="font-medium text-white">
                          {highlights.biggestMoverTitle}
                        </span>
                        <span
                          className={
                            highlights.biggestMoverDelta != null &&
                            highlights.biggestMoverDelta > 0
                              ? "text-emerald-400"
                              : highlights.biggestMoverDelta != null &&
                                  highlights.biggestMoverDelta < 0
                                ? "text-rose-400"
                                : "text-zinc-400"
                          }
                        >
                          {movementLabel(highlights.biggestMoverDelta)}
                        </span>
                      </p>
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setStep(2)}
                  className="w-full rounded-2xl bg-amber-500 py-3.5 text-base font-semibold text-zinc-950 shadow-lg shadow-amber-950/35 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  Dive In
                </button>
              </motion.div>
            ) : null}

            {step === 2 ? (
              <motion.div
                key="s2"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="space-y-6"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-200/80">
                  Communities
                </p>
                <h3 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  Shared billboards
                </h3>
                <p className="text-sm leading-relaxed text-zinc-400">
                  {communityCount > 0 ? (
                    <>
                      You're in{" "}
                      <span className="font-semibold text-zinc-200">
                        {communityCount}
                      </span>{" "}
                      {communityCount === 1 ? "community" : "communities"} with
                      weekly charts. Compare what your circle played this week.
                    </>
                  ) : (
                    <>
                      Join a community to unlock shared weekly billboards and
                      see what others are spinning.
                    </>
                  )}
                </p>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void finish()}
                  className="w-full rounded-2xl bg-amber-500 py-3.5 text-base font-semibold text-zinc-950 shadow-lg shadow-amber-950/35 transition hover:bg-amber-400 disabled:opacity-50"
                >
                  View Community Charts
                </button>

                <p className="text-center text-sm text-zinc-500">
                  <Link
                    href="/charts"
                    className="font-medium text-amber-400/90 underline-offset-4 hover:text-amber-300 hover:underline"
                  >
                    Open your personal chart
                  </Link>
                </p>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
