"use client";

import { useCallback, useState } from "react";
import { useToast } from "@/components/toast";
import { SendRecommendationModal } from "./send-recommendation-modal";

const PNG_SIZE = 1080;

function truncateForCard(text: string, max = 380): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trim()}…`;
}

function downloadPngBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Draws the share card with Canvas 2D (reliable). html-to-image on a far
 * off-screen node often yields a solid black PNG because the subtree isn’t painted.
 */
function createTasteMatchSharePngBlob(params: {
  score: number;
  summary: string;
  url: string;
}): Promise<Blob | null> {
  const W = PNG_SIZE;
  const H = PNG_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);

  const grd = ctx.createLinearGradient(0, 0, W, H);
  grd.addColorStop(0, "rgb(6, 78, 59)");
  grd.addColorStop(0.42, "rgb(9, 9, 11)");
  grd.addColorStop(1, "rgb(46, 16, 101)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  const pad = 72;
  const maxTextW = W - pad * 2;

  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  ctx.fillStyle = "#a1a1aa";
  ctx.font =
    '600 26px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText("TASTE MATCH", pad, pad);

  const scoreStr = String(params.score);
  ctx.fillStyle = "#ffffff";
  ctx.font =
    '700 200px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const scoreY = pad + 44;
  ctx.fillText(scoreStr, pad, scoreY);
  const scoreW = ctx.measureText(scoreStr).width;
  ctx.fillStyle = "#71717a";
  ctx.font =
    '600 90px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText("%", pad + scoreW + 12, scoreY + 36);

  const summary = truncateForCard(params.summary);
  ctx.fillStyle = "#e4e4e7";
  ctx.font =
    '32px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const lineHeight = 44;
  let y = scoreY + 200 + 40;
  const maxSummaryY = H - 220;
  const lines = wrapLines(ctx, summary, maxTextW);
  for (const line of lines) {
    if (y + lineHeight > maxSummaryY) break;
    ctx.fillText(line, pad, y);
    y += lineHeight;
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, H - pad - 100);
  ctx.lineTo(W - pad, H - pad - 100);
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font =
    '600 30px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText("Tracklist", pad, H - pad - 72);

  ctx.fillStyle = "#6ee7b7";
  ctx.font =
    '24px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  const urlLines = wrapLines(ctx, params.url, maxTextW);
  let uy = H - pad - 34;
  for (let i = 0; i < Math.min(3, urlLines.length); i++) {
    ctx.fillText(urlLines[i]!, pad, uy);
    uy += 30;
  }

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png", 1);
  });
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  const pushLine = (s: string) => {
    if (s) lines.push(s);
  };

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
      continue;
    }
    if (line) {
      pushLine(line);
      line = "";
    }
    if (ctx.measureText(word).width <= maxWidth) {
      line = word;
    } else {
      let chunk = "";
      for (const ch of word) {
        const t = chunk + ch;
        if (ctx.measureText(t).width > maxWidth && chunk) {
          pushLine(chunk);
          chunk = ch;
        } else {
          chunk = t;
        }
      }
      line = chunk;
    }
  }
  if (line) pushLine(line);
  return lines;
}

export function TasteMatchSocialActions({
  profileUserId,
  shareSnapshot,
}: {
  profileUserId: string;
  /** Data for the generated share image (summary + score). */
  shareSnapshot: { score: number; summary: string };
}) {
  const [recOpen, setRecOpen] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const { toast } = useToast();

  const btn =
    "inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700/70 bg-zinc-950/60 px-3 py-2.5 text-center text-xs font-medium text-zinc-200 shadow-sm shadow-black/20 transition-colors hover:border-emerald-500/45 hover:bg-zinc-900/90 hover:text-white sm:text-sm min-h-[44px] sm:min-h-0";

  const shareTasteMatch = useCallback(async () => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/profile/${profileUserId}#taste-match`;
    const title = "Taste match on Tracklist";
    const text =
      "Open this link to compare our music taste on Tracklist.";
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url });
        return;
      }
    } catch {
      /* user cancelled share sheet */
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied — paste it in a text, DM, or email.");
    } catch {
      window.prompt("Copy this link:", url);
    }
  }, [profileUserId, toast]);

  const shareTasteMatchImage = useCallback(async () => {
    if (imageBusy) return;
    setImageBusy(true);
    try {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const url = `${origin}/profile/${profileUserId}#taste-match`;

      const blob = await createTasteMatchSharePngBlob({
        score: shareSnapshot.score,
        summary: shareSnapshot.summary,
        url,
      });
      if (!blob) {
        toast("Could not create image — try again.");
        return;
      }

      const filename = "taste-match-tracklist.png";
      const file = new File([blob], filename, { type: "image/png" });
      const title = "Taste match on Tracklist";
      const text =
        "Compare our listening on Tracklist — open the link for the full breakdown.";

      const withFiles = { files: [file], title, text, url };
      if (navigator.canShare?.(withFiles)) {
        try {
          await navigator.share(withFiles);
          return;
        } catch {
          /* cancelled or failed — fall through to download */
        }
      }

      downloadPngBlob(blob, filename);
      toast("Image saved — attach it in Messages, Instagram, or any app.");
    } catch (e) {
      console.error("[shareTasteMatchImage]", e);
      toast("Could not create image — try again.");
    } finally {
      setImageBusy(false);
    }
  }, [imageBusy, profileUserId, shareSnapshot.score, shareSnapshot.summary, toast]);

  return (
    <>
      <div className="mt-8 border-t border-white/5 pt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Connect
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Send a recommendation, share a link, or export a square image to drop
          into DMs or stories.
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={() => setRecOpen(true)}
            className={btn}
            title="Send them an artist, album, or track"
          >
            Send Rec
          </button>
          <button
            type="button"
            onClick={() => void shareTasteMatch()}
            className={btn}
            title="Share a link to this taste match (Messages, email, etc.)"
          >
            Share taste match
          </button>
          <button
            type="button"
            onClick={() => void shareTasteMatchImage()}
            disabled={imageBusy}
            className={btn}
            title="Create a PNG card with your score to share as an image"
          >
            {imageBusy ? "Making image…" : "Share image"}
          </button>
        </div>
      </div>
      {recOpen ? (
        <SendRecommendationModal
          recipientUserId={profileUserId}
          onClose={() => setRecOpen(false)}
        />
      ) : null}
    </>
  );
}
