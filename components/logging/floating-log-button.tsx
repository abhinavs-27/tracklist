"use client";

import { useLogging } from "./logging-context";

export function FloatingLogButton() {
  const { setQuickLogOpen, logBusy } = useLogging();

  return (
    <div className="pointer-events-none fixed inset-x-0 z-[80] flex justify-end p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6 bottom-0 max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-0">
      <button
        type="button"
        aria-label="Quick log listen"
        onClick={() => setQuickLogOpen(true)}
        disabled={logBusy}
        className="pointer-events-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-3xl font-light leading-none text-white shadow-lg shadow-black/40 transition hover:bg-emerald-400 disabled:opacity-85"
      >
        <span className="-mt-0.5">＋</span>
      </button>
    </div>
  );
}
