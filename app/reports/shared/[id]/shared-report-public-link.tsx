"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type Props = {
  reportId: string;
  /** Only public reports have a link anyone can open. */
  isPublic: boolean;
};

export function SharedReportPublicLink({ reportId, isPublic }: Props) {
  const { toast } = useToast();
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !isPublic) return;
    setShareUrl(
      `${window.location.origin}/reports/shared/${encodeURIComponent(reportId)}`,
    );
  }, [reportId, isPublic]);

  const copy = useCallback(async () => {
    if (!shareUrl) return;
    const ok = await copyTextToClipboard(shareUrl);
    if (ok) {
      toast("Link copied to clipboard");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } else {
      toast("Couldn’t copy — select the link and copy manually");
    }
  }, [shareUrl, toast]);

  if (!isPublic || !shareUrl) return null;

  return (
    <div
      className={`rounded-xl border px-4 py-3 transition-colors ${
        copied
          ? "border-emerald-500/45 bg-emerald-950/35"
          : "border-zinc-700/80 bg-zinc-900/50"
      }`}
      role="region"
      aria-label="Public share link"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {copied ? "Copied" : "Share this report"}
          </p>
          <p className="mt-1.5 break-all font-mono text-[11px] leading-relaxed text-zinc-300">
            {shareUrl}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-lg border border-zinc-600 bg-zinc-800/80 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-emerald-600/50 hover:bg-zinc-800"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
