"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import { formatWeeklyChartShareText } from "@/lib/charts/format-chart-share-text";
import {
  getChartShareImageApiUrl,
  getChartShareImageFilename,
} from "@/lib/charts/chart-share-image-api-url";
import type { ChartMomentPayload, ChartType } from "@/lib/charts/weekly-chart-types";

// ── Share option button ────────────────────────────────────────────────────

function ShareOption({
  icon,
  label,
  onClick,
  disabled = false,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  href?: string;
}) {
  const cls =
    "flex flex-col items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed";
  const inner = (
    <>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800 ring-1 ring-white/[0.08] transition hover:bg-zinc-700 active:scale-95">
        {icon}
      </div>
      <span className="text-xs text-zinc-400">{label}</span>
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener" className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}

// ── Icons ──────────────────────────────────────────────────────────────────

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-zinc-200" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-zinc-200" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-zinc-200" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 text-zinc-200" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="url(#ig-grad)" aria-hidden>
      <defs>
        <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433" />
          <stop offset="50%" stopColor="#dc2743" />
          <stop offset="100%" stopColor="#bc1888" />
        </linearGradient>
      </defs>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  );
}

// ── Main modal ─────────────────────────────────────────────────────────────

export function ChartShareModal(props: {
  open: boolean;
  onClose: () => void;
  chartKind: string;
  chartType: ChartType;
  weekStartIso: string | null;
  chart_moment: ChartMomentPayload;
  disableFormattedShare?: boolean;
  communityId?: string | null;
  shareTitle?: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const onKey = useCallback(
    (e: KeyboardEvent) => { if (e.key === "Escape") props.onClose(); },
    [props],
  );

  useEffect(() => {
    if (!props.open) return;
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [props.open, onKey]);

  if (!props.open) return null;

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const numberOne = props.chart_moment.number_one;
  const top5 = props.chart_moment.top_5.slice(0, 5);
  const weekLabel = props.chart_moment.week_label;
  const canShare = top5.length > 0 || numberOne != null;

  const summaryText = formatWeeklyChartShareText({
    chartKind: props.chartKind,
    moment: props.chart_moment,
    pageUrl,
  });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { toast("Couldn't copy link"); }
  }

  async function nativeShare() {
    if (!canShare) return;
    setBusy(true);
    try {
      // Try sharing with chart image first
      if (props.chartType && typeof navigator !== "undefined" && navigator.share) {
        const imgUrl = getChartShareImageApiUrl({
          chartType: props.chartType,
          weekStart: props.weekStartIso ?? null,
          communityId: props.communityId,
        });
        try {
          const res = await fetch(imgUrl, { credentials: "include", cache: "no-store" });
          if (res.ok) {
            const blob = await res.blob();
            const file = new File(
              [blob],
              getChartShareImageFilename({ chartType: props.chartType, weekStart: props.weekStartIso ?? null, communityId: props.communityId }),
              { type: "image/png" },
            );
            const shareData: ShareData = { title: `${props.shareTitle ?? "Weekly Billboard"} · ${props.chartKind}`, text: summaryText, files: [file] };
            if (navigator.canShare?.(shareData)) {
              await navigator.share(shareData);
              return;
            }
          }
        } catch { /* fall through to text-only share */ }
      }
      // Text-only fallback
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: props.shareTitle ?? "Weekly Billboard", text: summaryText, url: pageUrl });
      } else {
        await navigator.clipboard.writeText(summaryText);
        toast("Summary copied");
      }
    } catch (e) {
      const err = e as { name?: string };
      if (err.name !== "AbortError") toast("Couldn't share");
    } finally {
      setBusy(false);
    }
  }

  async function downloadImage() {
    if (!props.chartType) return;
    setBusy(true);
    try {
      const imgUrl = getChartShareImageApiUrl({ chartType: props.chartType, weekStart: props.weekStartIso ?? null, communityId: props.communityId });
      const res = await fetch(imgUrl, { credentials: "include" });
      if (!res.ok) { toast("Couldn't generate image"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getChartShareImageFilename({ chartType: props.chartType, weekStart: props.weekStartIso ?? null, communityId: props.communityId });
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast("Couldn't download image"); }
    finally { setBusy(false); }
  }

  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(summaryText)}`;
  const hasNativeShare = typeof navigator !== "undefined" && !!navigator.share;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chart-share-title"
    >
      <button type="button" className="absolute inset-0 bg-black/75 backdrop-blur-sm" aria-label="Close" onClick={props.onClose} />

      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-t-3xl bg-zinc-950 pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-3xl">
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>

        {/* Preview card */}
        <div className="px-5 pb-4 pt-3">
          <p className="text-center text-xs font-medium uppercase tracking-widest text-zinc-500">
            {weekLabel}
          </p>
          {numberOne && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-zinc-900/60 px-3 py-2.5 ring-1 ring-white/[0.06]">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-amber-400/80">#1 this week</p>
                <p className="truncate text-sm font-semibold text-white">{numberOne.name}</p>
                {numberOne.artist_name && (
                  <p className="truncate text-xs text-zinc-500">{numberOne.artist_name}</p>
                )}
              </div>
            </div>
          )}
          {top5.length > 1 && (
            <p className="mt-2 text-center text-xs text-zinc-600">
              + {props.chartKind}: {top5.slice(1, 4).map(r => r.name).join(", ")}
              {top5.length > 4 ? "…" : ""}
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-zinc-800/60" />

        {/* Share options grid */}
        <div className="px-6 py-5">
          <div className="flex items-start justify-around gap-2">
            <ShareOption icon={<LinkIcon />} label={copied ? "Copied!" : "Copy Link"} onClick={copyLink} />
            {hasNativeShare ? (
              <ShareOption icon={<ShareIcon />} label="Share" onClick={() => void nativeShare()} disabled={busy || !canShare} />
            ) : (
              <ShareOption icon={<XIcon />} label="X" href={canShare ? tweetUrl : undefined} disabled={!canShare} />
            )}
            {/* Instagram: downloads the 1080×1350 chart card — save to camera roll, then post */}
            {props.chartType && (
              <ShareOption
                icon={<InstagramIcon />}
                label="Instagram"
                onClick={() => void downloadImage()}
                disabled={busy || !canShare}
              />
            )}
            {props.chartType && (
              <ShareOption icon={<DownloadIcon />} label="Save image" onClick={() => void downloadImage()} disabled={busy || !canShare} />
            )}
          </div>
        </div>

        {/* Cancel */}
        <div className="border-t border-zinc-800/60 px-5 pb-5 pt-3">
          <button
            type="button"
            onClick={props.onClose}
            className="w-full rounded-2xl bg-zinc-800/80 py-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
