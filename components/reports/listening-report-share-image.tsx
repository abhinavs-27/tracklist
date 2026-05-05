"use client";

import { useEffect, useState } from "react";
import type { ListeningReportShareCardRow } from "@/components/reports/listening-report-share-card";

function slugifyFilename(s: string): string {
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return slug || "report";
}

export type ListeningReportShareImageModalProps = {
  open: boolean;
  onClose: () => void;
  reportTitle: string;
  periodLabel: string;
  entityLabel: string;
  rows: ListeningReportShareCardRow[];
  shareUrl?: string | null;
  ownerHandle?: string | null;
  totalPlays?: number | null;
};

export function ListeningReportShareImageModal(props: ListeningReportShareImageModalProps) {
  const { open, onClose, reportTitle, periodLabel, entityLabel, rows, shareUrl, ownerHandle, totalPlays } = props;
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function fetchBlob(): Promise<Blob | null> {
    setError(null);
    const res = await fetch("/api/reports/share-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportTitle,
        periodLabel,
        entityLabel,
        rows: rows.slice(0, 5),
        ownerHandle: ownerHandle ?? null,
        totalPlays: totalPlays ?? null,
        shareUrl: shareUrl ?? null,
      }),
    });
    if (!res.ok) {
      setError("Could not create image.");
      return null;
    }
    return res.blob();
  }

  async function downloadPng() {
    setExporting(true);
    try {
      const blob = await fetchBlob();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tracklist-${slugifyFilename(reportTitle)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create image.");
    } finally {
      setExporting(false);
    }
  }

  async function shareOrDownload() {
    setExporting(true);
    try {
      const blob = await fetchBlob();
      if (!blob) return;
      const file = new File([blob], `tracklist-${slugifyFilename(reportTitle)}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: reportTitle, text: shareUrl ?? "My listening report on Tracklist" });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Could not share.");
    } finally {
      setExporting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-report-image-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="share-report-image-title" className="text-lg font-semibold text-white">
          Share image
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Save a PNG to your device or use your system share sheet (mobile).
        </p>

        {error ? (
          <p className="mt-3 text-sm text-red-400" role="status">{error}</p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void downloadPng()}
            disabled={exporting}
            className="min-h-11 flex-1 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {exporting ? "Working…" : "Download PNG"}
          </button>
          <button
            type="button"
            onClick={() => void shareOrDownload()}
            disabled={exporting}
            className="min-h-11 flex-1 rounded-full border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
          >
            Share…
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-full border border-zinc-700 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
        >
          Close
        </button>
      </div>
    </div>
  );
}
