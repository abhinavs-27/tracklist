"use client";

import { useCallback, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import {
  getListeningStyleDisplay,
  STYLE_ACCENT_COLOR,
  AXIS_DISPLAY,
  normalizeListeningStyle,
} from "@/lib/taste/listening-style";
import type { TasteStyleResult } from "@/lib/taste/types";
import type { TasteListeningStyle } from "@/lib/taste/listening-style";

async function fetchIdentityPng(): Promise<File> {
  const res = await fetch("/api/profile/identity-card", {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(err?.error ?? "Could not generate card");
  }
  const blob = await res.blob();
  return new File([blob], "tracklist-identity.png", { type: "image/png" });
}

function detectShareCapability(): "native-files" | "download" {
  if (typeof navigator === "undefined") return "download";
  if (!/mobile|android|iphone|ipad|ipod/i.test(navigator.userAgent)) return "download";
  try {
    if (navigator.canShare?.({ files: [new File([], "t.png", { type: "image/png" })] }))
      return "native-files";
  } catch { /* ignore */ }
  return "download";
}

type AxisBarProps = {
  label: string;
  leftLabel: string;
  rightLabel: string;
  score: number | null;
  pole: "left" | "right" | "neutral" | null;
};

function AxisBar({ label, leftLabel, rightLabel, score, pole }: AxisBarProps) {
  if (score === null) {
    return (
      <div className="flex items-center gap-3 text-xs">
        <span className="w-24 shrink-0 text-zinc-600">{label}</span>
        <span className="text-zinc-700 italic text-[11px]">
          No data — requires Spotify listening history
        </span>
      </div>
    );
  }

  const pct = Math.min(100, Math.max(0, score));
  const isNeutral = pole === "neutral";
  const poleLabel = pole === "left" ? leftLabel : pole === "right" ? rightLabel : "Balanced";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3 text-xs">
        <span className="w-24 shrink-0 text-zinc-500">{label}</span>
        <div className="relative flex-1 h-1.5 rounded-full bg-zinc-800">
          {/* Left pole label */}
          <span className="absolute -top-4 left-0 text-[10px] text-zinc-700">{leftLabel}</span>
          {/* Right pole label */}
          <span className="absolute -top-4 right-0 text-[10px] text-zinc-700">{rightLabel}</span>
          <div
            className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]"
            style={{ left: `calc(${pct}% - 6px)` }}
          />
        </div>
        <span className={`w-20 shrink-0 text-right text-[11px] font-medium ${isNeutral ? "text-zinc-600" : "text-zinc-300"}`}>
          {poleLabel}
        </span>
      </div>
    </div>
  );
}

type Props = {
  styleKey: TasteListeningStyle;
  styleResult: TasteStyleResult | null | undefined;
  totalLogs: number;
  totalArtists: number;
  isOwnProfile: boolean;
};

export function TasteStyleWidget({
  styleKey,
  styleResult,
  totalLogs,
  totalArtists,
  isOwnProfile,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [sharing, setSharing] = useState(false);
  const shareCapability = useRef(detectShareCapability());
  const { toast } = useToast();
  const copy = getListeningStyleDisplay(styleKey);
  const accent = STYLE_ACCENT_COLOR[styleKey] ?? "#10b981";

  const [copying, setCopying] = useState(false);

  const handleShare = useCallback(async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const file = await fetchIdentityPng();
      if (shareCapability.current === "native-files") {
        await navigator.share({ files: [file], title: "My listening style on Tracklist" });
      } else {
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
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      toast(e instanceof Error ? e.message : "Could not generate card");
    } finally {
      setSharing(false);
    }
  }, [sharing, toast]);

  const handleCopyImage = useCallback(async () => {
    if (copying) return;
    setCopying(true);
    try {
      const file = await fetchIdentityPng();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": file }),
      ]);
      toast("Image copied — paste it anywhere");
    } catch {
      toast("Could not copy image");
    } finally {
      setCopying(false);
    }
  }, [copying, toast]);

  const axes = styleResult?.axes;

  return (
    <div
      className="rounded-xl border px-4 py-4"
      style={{ borderColor: `${accent}40`, backgroundColor: `${accent}0a` }}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: `${accent}e6` }}>
        Listening style
      </p>

      <div className="mt-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-tight text-white sm:text-3xl">
            {copy.title}
          </p>
          {styleResult?.badge ? (
            <span
              className="mt-1.5 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{
                backgroundColor: `${accent}18`,
                border: `1px solid ${accent}30`,
                color: `${accent}dd`,
              }}
            >
              {styleResult.badge}
            </span>
          ) : null}
        </div>

        {isOwnProfile ? (
          <div className="flex shrink-0 gap-1.5">
            {/* Copy to clipboard — desktop only; mobile gets image via native share sheet */}
            {shareCapability.current === "download" ? (
              <button
                type="button"
                onClick={() => void handleCopyImage()}
                disabled={copying || sharing}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-zinc-600 hover:text-white disabled:opacity-50"
                title="Copy image to clipboard — paste into Twitter, Discord, etc."
              >
                {copying ? (
                  <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                  </svg>
                )}
                {copying ? "Copying…" : "Copy"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleShare()}
              disabled={sharing || copying}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs font-semibold text-zinc-300 transition hover:border-zinc-600 hover:text-white disabled:opacity-50"
            >
              {sharing ? (
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              )}
              {sharing ? "Generating…" : shareCapability.current === "native-files" ? "Share" : "Download"}
            </button>
          </div>
        ) : null}
      </div>

      <p className="mt-1.5 text-sm leading-snug text-zinc-400">{copy.subtitle}</p>

      {axes ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-3 text-[11px] text-zinc-600 transition hover:text-zinc-400"
          >
            {expanded ? "Hide breakdown ↑" : "Show breakdown ↓"}
          </button>

          {expanded ? (
            <div className="mt-3 space-y-5 border-t border-white/[0.06] pt-4">
              <AxisBar
                label="Range"
                leftLabel={AXIS_DISPLAY.range.left}
                rightLabel={AXIS_DISPLAY.range.right}
                score={axes.range.score}
                pole={axes.range.pole}
              />
              <AxisBar
                label="Discovery"
                leftLabel={AXIS_DISPLAY.discovery.left}
                rightLabel={AXIS_DISPLAY.discovery.right}
                score={axes.discovery?.score ?? null}
                pole={axes.discovery?.pole ?? null}
              />
              <AxisBar
                label="Mode"
                leftLabel={AXIS_DISPLAY.mode.left}
                rightLabel={AXIS_DISPLAY.mode.right}
                score={axes.mode?.score ?? null}
                pole={axes.mode?.pole ?? null}
              />
              <AxisBar
                label="Signal"
                leftLabel={AXIS_DISPLAY.signal.left}
                rightLabel={AXIS_DISPLAY.signal.right}
                score={axes.signal?.score ?? null}
                pole={axes.signal?.pole ?? null}
              />
              <p className="pt-1 text-[10px] text-zinc-700">
                Based on {totalLogs.toLocaleString()} plays across {totalArtists.toLocaleString()} artists
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
