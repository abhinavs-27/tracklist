"use client";

import { useState } from "react";
import {
  getListeningStyleDisplay,
  STYLE_ACCENT_COLOR,
  AXIS_DISPLAY,
} from "@/lib/taste/listening-style";
import type { TasteStyleResult } from "@/lib/taste/types";
import type { TasteListeningStyle } from "@/lib/taste/listening-style";

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
          <span className="absolute -top-4 left-0 text-[10px] text-zinc-700">{leftLabel}</span>
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
};

export function TasteStyleWidget({
  styleKey,
  styleResult,
  totalLogs,
  totalArtists,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const copy = getListeningStyleDisplay(styleKey);
  const accent = STYLE_ACCENT_COLOR[styleKey] ?? "#10b981";
  const axes = styleResult?.axes;

  return (
    <div
      className="rounded-xl border px-4 py-4"
      style={{ borderColor: `${accent}40`, backgroundColor: `${accent}0a` }}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide" style={{ color: `${accent}e6` }}>
        Listening style
      </p>

      <div className="mt-1 flex items-start gap-3">
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
