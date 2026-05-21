"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { formatWeeklyChartShareText } from "@/lib/charts/format-chart-share-text";
import {
  getChartShareImageApiUrl,
  getChartShareImageFilename,
} from "@/lib/charts/chart-share-image-api-url";
import type { ChartMomentPayload, ChartType } from "@/lib/charts/weekly-chart-types";

// ── Platform detection ─────────────────────────────────────────────────────

function detectShareCapability(): "native-files" | "download" {
  if (typeof navigator === "undefined") return "download";
  const mobile = /mobile|android|iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!mobile) return "download";
  try {
    const testFile = new File([], "test.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [testFile] })) return "native-files";
  } catch {
    // ignore
  }
  return "download";
}

// ── Fetch helper ────────────────────────────────────────────────────────────

async function fetchChartPng(args: {
  chartType: ChartType;
  weekStartIso: string | null;
  communityId?: string | null;
}): Promise<File> {
  const url = getChartShareImageApiUrl({
    chartType: args.chartType,
    weekStart: args.weekStartIso,
    communityId: args.communityId,
  });
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    const err = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(err?.error ?? "Could not generate image");
  }
  const blob = await res.blob();
  const filename = getChartShareImageFilename({
    chartType: args.chartType,
    weekStart: args.weekStartIso,
    communityId: args.communityId,
  });
  return new File([blob], filename, { type: "image/png" });
}

// ── Icons ───────────────────────────────────────────────────────────────────

function ShareIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}

function DownloadIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function LinkIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

function XIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

// ── Main modal ──────────────────────────────────────────────────────────────

export function ChartShareModal(props: {
  open: boolean;
  onClose: () => void;
  chartKind: string;
  chartType: ChartType;
  weekStartIso: string | null;
  chart_moment: ChartMomentPayload;
  /** @deprecated no-op — kept for backwards compat with existing callers */
  disableFormattedShare?: boolean;
  communityId?: string | null;
  shareTitle?: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);
  const shareCapability = useRef(detectShareCapability());

  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const numberOne = props.chart_moment.number_one;
  const summaryText = formatWeeklyChartShareText({
    chartKind: props.chartKind,
    moment: props.chart_moment,
    pageUrl,
  });
  const previewSrc = getChartShareImageApiUrl({
    chartType: props.chartType,
    weekStart: props.weekStartIso,
    communityId: props.communityId,
  });
  const tweetText = encodeURIComponent(summaryText);
  const tweetUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;

  // Keyboard dismiss + body scroll lock
  useEffect(() => {
    if (!props.open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") props.onClose(); };
    document.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [props.open, props.onClose]);

  const handlePrimaryAction = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const file = await fetchChartPng({
        chartType: props.chartType,
        weekStartIso: props.weekStartIso,
        communityId: props.communityId,
      });

      if (shareCapability.current === "native-files") {
        await navigator.share({
          files: [file],
          title: props.shareTitle ?? "My weekly chart on Tracklist",
        });
        return;
      }

      // Desktop: standard download
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast("Image downloaded");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return; // user cancelled share sheet
      toast(e instanceof Error ? e.message : "Couldn't generate image");
    } finally {
      setBusy(false);
    }
  }, [busy, props, toast]);

  const handleSavePng = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const file = await fetchChartPng({
        chartType: props.chartType,
        weekStartIso: props.weekStartIso,
        communityId: props.communityId,
      });
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast("Image downloaded");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't download image");
    } finally {
      setBusy(false);
    }
  }, [busy, props, toast]);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Couldn't copy link");
    }
  }, [pageUrl, toast]);

  if (!props.open) return null;

  const isMobileNative = shareCapability.current === "native-files";
  const primaryLabel = isMobileNative ? "Share image" : "Download image";
  const PrimaryIcon = isMobileNative ? ShareIcon : DownloadIcon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Share your chart"
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-label="Close"
        onClick={props.onClose}
      />

      <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-t-3xl bg-zinc-950 pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-3xl">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Share your chart</p>
          <button
            type="button"
            onClick={props.onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.06] transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Card preview */}
        <div className="px-5 pb-4">
          {!imgError ? (
            <div className="relative overflow-hidden rounded-2xl bg-zinc-900 aspect-[4/5] max-h-52">
              {/* Skeleton shimmer while loading */}
              <div className="absolute inset-0 animate-pulse bg-zinc-800" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt="Your chart card preview"
                crossOrigin="use-credentials"
                className="absolute inset-0 w-full h-full object-cover rounded-2xl opacity-0 transition-opacity duration-300"
                onLoad={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "1"; }}
                onError={() => setImgError(true)}
              />
              <div className="absolute top-2 right-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] text-white/40">
                Preview
              </div>
            </div>
          ) : numberOne ? (
            /* Fallback text preview if image fails */
            <div className="rounded-2xl bg-zinc-900/60 px-4 py-3 ring-1 ring-white/[0.06]">
              <p className="text-[10px] font-medium uppercase tracking-wider text-amber-400/80 mb-1">#1 this week</p>
              <p className="text-sm font-semibold text-white truncate">{numberOne.name}</p>
              {numberOne.artist_name && (
                <p className="text-xs text-zinc-500 truncate">{numberOne.artist_name}</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="border-t border-zinc-800/60" />

        {/* Primary action */}
        <div className="px-5 pt-4 pb-2">
          <button
            type="button"
            onClick={() => void handlePrimaryAction()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <PrimaryIcon className="h-5 w-5" />
            )}
            {busy ? "Generating…" : primaryLabel}
          </button>
          {isMobileNative && (
            <p className="mt-1.5 text-center text-[11px] text-zinc-600">
              Opens your phone&apos;s share sheet — pick Instagram, WhatsApp, and more
            </p>
          )}
        </div>

        {/* Secondary row */}
        <div className="px-5 pb-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleCopyLink()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 py-2.5 text-sm text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
            >
              <LinkIcon />
              {copied ? "Copied!" : "Copy link"}
            </button>
            {isMobileNative ? (
              <button
                type="button"
                onClick={() => void handleSavePng()}
                disabled={busy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 py-2.5 text-sm text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200 disabled:opacity-40"
              >
                <DownloadIcon className="h-4 w-4" />
                Save PNG
              </button>
            ) : null}
            <a
              href={tweetUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/50 py-2.5 text-sm text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
            >
              <XIcon />
              Post to X
            </a>
          </div>
        </div>

        {/* Instagram note — desktop only */}
        {!isMobileNative && (
          <div className="mx-5 mb-3 flex items-start gap-2 rounded-xl bg-white/[0.03] border border-white/[0.05] px-3 py-2.5">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 mt-0.5" fill="url(#ig-modal)" aria-hidden>
              <defs>
                <linearGradient id="ig-modal" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#f09433" />
                  <stop offset="50%" stopColor="#dc2743" />
                  <stop offset="100%" stopColor="#bc1888" />
                </linearGradient>
              </defs>
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
            <p className="text-[11px] leading-relaxed text-zinc-600">
              For Instagram: download the image, then upload from your camera roll.
            </p>
          </div>
        )}

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
