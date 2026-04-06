"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import {
  getChartShareImageApiUrl,
  getChartShareImageFilename,
} from "@/lib/charts/chart-share-image-api-url";
import type { ChartType } from "@/lib/charts/weekly-chart-types";

export function ChartShareImageDownload(props: {
  chartType: ChartType;
  weekStart: string | null;
  /** Community billboard export (members only). */
  communityId?: string | null;
  disabled?: boolean;
  className?: string;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function downloadPng() {
    if (props.disabled || loading) return;
    setLoading(true);
    try {
      const url = getChartShareImageApiUrl({
        chartType: props.chartType,
        weekStart: props.weekStart,
        communityId: props.communityId,
      });
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? "Could not generate image");
      }
      const blob = await res.blob();
      const filename = getChartShareImageFilename({
        chartType: props.chartType,
        weekStart: props.weekStart,
        communityId: props.communityId,
      });

      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      toast("Image downloaded");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not download image");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={props.disabled || loading}
      onClick={() => void downloadPng()}
      className={
        props.className ??
        "inline-flex w-full items-center justify-center rounded-xl border border-zinc-600 bg-zinc-800/90 px-4 py-3 text-sm font-semibold text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
      }
    >
      {loading ? "Generating…" : "Download share image (PNG)"}
    </button>
  );
}
