"use client";

import { useState } from "react";
import { useToast } from "@/components/toast";
import { formatWeeklyChartShareText } from "@/lib/charts/format-chart-share-text";
import {
  getChartShareImageApiUrl,
  getChartShareImageFilename,
} from "@/lib/charts/chart-share-image-api-url";
import type {
  ChartMomentPayload,
  ChartType,
} from "@/lib/charts/weekly-chart-types";

function btnClass(layout: "inline" | "stacked") {
  const base =
    "inline-flex items-center justify-center border border-zinc-600 bg-zinc-800/80 font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40";
  return layout === "stacked"
    ? `${base} w-full rounded-xl px-4 py-3 text-sm`
    : `${base} rounded-lg px-3 py-2 text-sm`;
}

export function ChartShareActions(props: {
  chartKind: string;
  chart_moment: ChartMomentPayload;
  /** When true, Share + Copy summary are disabled (still allow Copy link). */
  disableFormattedShare?: boolean;
  /** `stacked`: full-width column (modal). `inline`: horizontal wrap (toolbar). */
  layout?: "inline" | "stacked";
  /** With week/community context, Share fetches the PNG and attaches it when the browser supports file sharing. */
  chartType?: ChartType;
  weekStartIso?: string | null;
  communityId?: string | null;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const pageUrl =
    typeof window !== "undefined" ? window.location.href : "";

  const summaryForShare = () =>
    formatWeeklyChartShareText({
      chartKind: props.chartKind,
      moment: props.chart_moment,
    });

  const summaryWithLink = () =>
    formatWeeklyChartShareText({
      chartKind: props.chartKind,
      moment: props.chart_moment,
      pageUrl,
    });

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summaryWithLink());
      toast("Summary copied");
    } catch {
      toast("Couldn’t copy");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(pageUrl);
      toast("Link copied");
    } catch {
      toast("Couldn’t copy link");
    }
  }

  async function share() {
    if (props.disableFormattedShare) return;
    const title = `Weekly Billboard · ${props.chartKind}`;
    const textBody = summaryWithLink();
    const url = pageUrl;

    let sharedImage = false;
    if (
      props.chartType != null &&
      typeof navigator !== "undefined" &&
      navigator.share
    ) {
      setBusy(true);
      try {
        const imgUrl = getChartShareImageApiUrl({
          chartType: props.chartType,
          weekStart: props.weekStartIso ?? null,
          communityId: props.communityId,
        });
        const res = await fetch(imgUrl, {
          credentials: "include",
          cache: "no-store",
        });
        if (res.ok) {
          const blob = await res.blob();
          const file = new File(
            [blob],
            getChartShareImageFilename({
              chartType: props.chartType,
              weekStart: props.weekStartIso ?? null,
              communityId: props.communityId,
            }),
            { type: "image/png" },
          );
          const shareData: ShareData = {
            title,
            text: `${summaryForShare()}\n\n${url}`,
            files: [file],
          };
          if (navigator.canShare?.(shareData)) {
            await navigator.share(shareData);
            sharedImage = true;
          }
        } else {
          const err = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          toast(err?.error ?? "Could not generate image");
        }
      } catch (e) {
        const err = e as { name?: string };
        if (err.name !== "AbortError") {
          toast("Could not share image");
        }
      } finally {
        setBusy(false);
      }
    }

    if (sharedImage) return;

    if (typeof navigator !== "undefined" && navigator.share) {
      setBusy(true);
      try {
        await navigator.share({
          title,
          text: textBody,
          url,
        });
      } catch (e) {
        const err = e as { name?: string };
        if (err.name !== "AbortError") {
          await copySummary();
        }
      } finally {
        setBusy(false);
      }
      return;
    }

    await copySummary();
  }

  const blockSummary = props.disableFormattedShare;
  const disabled = blockSummary || busy;
  const layout = props.layout ?? "inline";
  const wrapClass =
    layout === "stacked"
      ? "flex flex-col gap-2"
      : "flex flex-wrap items-center gap-2";

  return (
    <div className={wrapClass}>
      <button
        type="button"
        className={`${btnClass(layout)} border-emerald-700/60 bg-emerald-950/40 text-emerald-100 hover:border-emerald-500/80 hover:bg-emerald-950/60 ${layout === "stacked" ? "py-3.5 text-base font-semibold" : ""}`}
        disabled={disabled}
        onClick={() => void share()}
      >
        {busy ? "…" : "Share"}
      </button>
      <button
        type="button"
        className={btnClass(layout)}
        disabled={blockSummary}
        onClick={() => void copySummary()}
      >
        Copy summary
      </button>
      <button
        type="button"
        className={btnClass(layout)}
        onClick={() => void copyLink()}
      >
        Copy link
      </button>
    </div>
  );
}
