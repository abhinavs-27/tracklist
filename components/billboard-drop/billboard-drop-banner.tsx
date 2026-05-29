"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export function BillboardDropBanner({ weekLabel }: { weekLabel: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-zinc-950 shadow-[0_20px_56px_-16px_rgba(251,191,36,0.28)] ring-1 ring-inset ring-white/[0.05]"
    >
      {/* Radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at 15% 50%, rgba(251,191,36,0.18) 0%, transparent 55%), radial-gradient(ellipse at 85% 80%, rgba(180,83,9,0.10) 0%, transparent 45%)",
        }}
      />

      <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6">
        <div className="flex items-start gap-4">
          {/* Bar chart icon */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/12 ring-1 ring-amber-500/25">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="3" y="14" width="4" height="7" rx="1.5" fill="rgba(251,191,36,0.9)" />
              <rect x="10" y="9" width="4" height="12" rx="1.5" fill="rgba(251,191,36,0.65)" />
              <rect x="17" y="4" width="4" height="17" rx="1.5" fill="rgba(251,191,36,0.45)" />
            </svg>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-400/90">
              Weekly Billboard
            </p>
            <p className="mt-0.5 text-base font-bold tracking-tight text-white sm:text-lg">
              Your chart for {weekLabel} is ready
            </p>
            <p className="mt-0.5 text-sm text-zinc-400">
              See what rose, what dropped, and your #1 this week.
            </p>
          </div>
        </div>

        <Link
          href="/"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-zinc-950 shadow-[0_4px_20px_rgba(251,191,36,0.35)] transition hover:bg-amber-400 hover:shadow-[0_4px_24px_rgba(251,191,36,0.5)] active:scale-95"
        >
          View chart
        </Link>
      </div>
    </motion.div>
  );
}
