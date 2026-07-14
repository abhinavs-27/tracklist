"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import type { ListeningReportShareCardRow } from "@/components/reports/listening-report-share-card";

function slugifyFilename(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "report"
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

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-gold-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function NativeShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 text-zinc-200" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
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
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="url(#ig-grad-report)" aria-hidden>
      <defs>
        <linearGradient id="ig-grad-report" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433" />
          <stop offset="50%" stopColor="#dc2743" />
          <stop offset="100%" stopColor="#bc1888" />
        </linearGradient>
      </defs>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
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

function SpinnerIcon() {
  return (
    <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-zinc-300" aria-hidden />
  );
}

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
  const cls = "flex flex-col items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed";
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

// ── Main modal ─────────────────────────────────────────────────────────────

export type ShareReportModalProps = {
  open: boolean;
  onClose: () => void;
  defaultName: string;
  periodLabel: string;
  entityLabel: string;
  rows: ListeningReportShareCardRow[];
  ownerHandle?: string | null;
  totalPlays?: number | null;
  /** Called when a public link is needed. Returns URL or null on failure. */
  onSavePublic: (name: string) => Promise<{ url: string } | null>;
};

export function ShareReportModal(props: ShareReportModalProps) {
  const { open, onClose, defaultName, periodLabel, entityLabel, rows, ownerHandle, totalPlays, onSavePublic } = props;
  const { toast } = useToast();

  const [name, setName] = useState(defaultName);
  const [variant, setVariant] = useState<"list" | "spotlight">("list");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const linkCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Spotlight only useful when #1 item has a cover image
  const hasSpotlightImage = !!(rows[0]?.image);

  const [prevResetKey, setPrevResetKey] = useState({ open, defaultName });
  if (open !== prevResetKey.open || defaultName !== prevResetKey.defaultName) {
    setPrevResetKey({ open, defaultName });
    if (open) {
      setName(defaultName);
      setVariant("list");
      setShareUrl(null);
      setLinkCopied(false);
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    return () => { if (linkCopiedTimerRef.current) clearTimeout(linkCopiedTimerRef.current); };
  }, []);

  async function ensureShareUrl(): Promise<string | null> {
    if (shareUrl) return shareUrl;
    const result = await onSavePublic(name.trim() || defaultName);
    if (!result) return null;
    setShareUrl(result.url);
    return result.url;
  }

  async function copyLink() {
    setBusy(true);
    try {
      const url = await ensureShareUrl();
      if (!url) { toast("Could not create share link"); return; }
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      if (linkCopiedTimerRef.current) clearTimeout(linkCopiedTimerRef.current);
      linkCopiedTimerRef.current = setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      toast("Couldn't copy link");
    } finally {
      setBusy(false);
    }
  }

  async function fetchImageBlob(url: string | null): Promise<Blob | null> {
    const reportTitle = name.trim() || defaultName;
    const res = await fetch("/api/reports/share-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        variant,
        reportTitle,
        periodLabel,
        entityLabel,
        rows: rows.slice(0, 5),
        ownerHandle: ownerHandle ?? null,
        totalPlays: totalPlays ?? null,
        shareUrl: url ?? null,
      }),
    });
    if (!res.ok) return null;
    return res.blob();
  }

  async function nativeShare() {
    setBusy(true);
    try {
      const url = await ensureShareUrl();
      const blob = await fetchImageBlob(url);
      const shareTitle = name.trim() || defaultName;

      if (blob) {
        const file = new File([blob], `tracklist-${slugifyFilename(shareTitle)}.png`, { type: "image/png" });
        const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
        const shareData: ShareData = {
          title: shareTitle,
          text: `${shareTitle} on Tracklist`,
          ...(url ? { url } : {}),
          files: [file],
        };
        if (typeof nav.share === "function" && nav.canShare?.(shareData)) {
          await nav.share(shareData);
          return;
        }
      }
      if (typeof navigator.share === "function") {
        await navigator.share({ title: shareTitle, ...(url ? { url } : {}) });
        return;
      }
      if (url) { await navigator.clipboard.writeText(url); toast("Link copied"); }
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast("Couldn't share");
    } finally {
      setBusy(false);
    }
  }

  async function downloadImage() {
    setBusy(true);
    try {
      const blob = await fetchImageBlob(shareUrl);
      if (!blob) { toast("Could not create image"); return; }
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `tracklist-${slugifyFilename(name.trim() || defaultName)}.png`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast("Could not download image");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const topRows = rows.slice(0, 5);
  const reportTitle = name.trim() || defaultName;
  const hasNativeShare = typeof navigator !== "undefined" && !!navigator.share;
  const tweetText = `${reportTitle} on Tracklist${shareUrl ? `\n${shareUrl}` : ""}`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  return (
    <div
        className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-report-title"
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          aria-label="Close"
          onClick={onClose}
        />

        <div className="relative z-10 w-full max-w-sm overflow-hidden rounded-t-3xl bg-zinc-950 pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-3xl">
          {/* Drag handle (mobile) */}
          <div className="flex justify-center pt-3 sm:hidden">
            <div className="h-1 w-10 rounded-full bg-zinc-700" />
          </div>

          {/* Preview + name */}
          <div className="px-5 pb-4 pt-3">
            <p className="text-center text-xs font-medium uppercase tracking-widest text-zinc-500">
              {periodLabel}
            </p>
            {topRows[0] && (
              <div className="mt-3 flex items-center gap-3 rounded-2xl bg-zinc-900/60 px-3 py-2.5 ring-1 ring-white/[0.06]">
                {topRows[0].image ? (
                  <img
                    src={topRows[0].image}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-zinc-500 text-sm">
                    ♪
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-amber-400/80">
                    #1 {entityLabel.toLowerCase()}
                  </p>
                  <p className="truncate text-sm font-semibold text-white">
                    {topRows[0].name}
                  </p>
                </div>
              </div>
            )}
            {topRows.length > 1 && (
              <p className="mt-2 text-center text-xs text-zinc-600">
                + {topRows.slice(1, 4).map((r) => r.name).join(", ")}
                {topRows.length > 4 ? "…" : ""}
              </p>
            )}

            {/* Editable name (subtle) */}
            {/* Card format toggle */}
            <div className="mt-4 flex gap-1 rounded-xl bg-zinc-800/50 p-1">
              <button
                type="button"
                onClick={() => setVariant("list")}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition ${
                  variant === "list" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Top 5 list
              </button>
              <button
                type="button"
                onClick={() => setVariant("spotlight")}
                disabled={!hasSpotlightImage}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition disabled:opacity-40 ${
                  variant === "spotlight" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-zinc-200"
                }`}
                title={!hasSpotlightImage ? "Spotlight requires a cover image" : undefined}
              >
                Spotlight #1
              </button>
            </div>

            <div className="mt-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Report name"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                aria-label="Report name"
              />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-800/60" />

          {/* Share options grid */}
          <div className="px-6 py-5">
            <div className="flex items-start justify-around gap-2">
              <ShareOption
                icon={busy && !linkCopied ? <SpinnerIcon /> : linkCopied ? <CheckIcon /> : <LinkIcon />}
                label={linkCopied ? "Copied!" : "Copy Link"}
                onClick={() => void copyLink()}
                disabled={busy}
              />
              {hasNativeShare ? (
                <ShareOption
                  icon={busy ? <SpinnerIcon /> : <NativeShareIcon />}
                  label="Share"
                  onClick={() => void nativeShare()}
                  disabled={busy}
                />
              ) : (
                <ShareOption
                  icon={<XIcon />}
                  label="X / Twitter"
                  href={tweetUrl}
                  disabled={busy}
                />
              )}
              <ShareOption
                icon={busy ? <SpinnerIcon /> : <InstagramIcon />}
                label="Instagram"
                onClick={() => void downloadImage()}
                disabled={busy}
              />
              <ShareOption
                icon={busy ? <SpinnerIcon /> : <DownloadIcon />}
                label="Save image"
                onClick={() => void downloadImage()}
                disabled={busy}
              />
            </div>
          </div>

          {/* Cancel */}
          <div className="border-t border-zinc-800/60 px-5 pb-5 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-2xl bg-zinc-800/80 py-3.5 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
  );
}
