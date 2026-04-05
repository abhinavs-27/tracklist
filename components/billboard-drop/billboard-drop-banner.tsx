"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export function BillboardDropBanner({ weekLabel }: { weekLabel: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-r from-amber-950/50 via-zinc-950/90 to-zinc-950 p-4 shadow-[0_12px_40px_-12px_rgba(251,191,36,0.25)] ring-1 ring-inset ring-white/[0.06]"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 50%, rgba(251,191,36,0.9), transparent 45%)",
        }}
      />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/90">
            Weekly chart
          </p>
          <p className="mt-1 text-base font-semibold tracking-tight text-white">
            Your Billboard for {weekLabel} is ready
          </p>
          <p className="mt-0.5 text-sm text-zinc-400">
            Open your chart to see rankings and movers.
          </p>
        </div>
        <Link
          href="/charts"
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 shadow-lg shadow-amber-950/40 transition hover:bg-amber-400"
        >
          View chart
        </Link>
      </div>
    </motion.div>
  );
}
