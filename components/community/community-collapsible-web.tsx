"use client";

import { useState } from "react";
import { communityHeadline, communityMeta } from "@/lib/ui/surface";

type Props = {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function CommunityCollapsibleWeb({
  title,
  subtitle,
  defaultOpen = true,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/35 ring-1 ring-white/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-3 px-4 py-3.5 text-left transition hover:bg-zinc-900/30 sm:px-5 sm:py-4"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <p className={communityHeadline}>{title}</p>
          {subtitle ? (
            <p className={`mt-1 ${communityMeta}`}>{subtitle}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-lg leading-none text-zinc-500 tabular-nums">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? <div className="border-t border-white/[0.06] px-4 pb-4 pt-1 sm:px-5 sm:pb-5">{children}</div> : null}
    </div>
  );
}
