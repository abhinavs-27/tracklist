"use client";

import { useCallback, useState } from "react";
import type { TasteMatchResponse } from "@/types";
import { useToast } from "@/components/toast";
import { SendRecommendationModal } from "./send-recommendation-modal";
import { SOCIAL_INBOX_AND_MUSIC_REC_UI_ENABLED } from "@/lib/feature-social-music-rec-ui";

const SHARE_W = 1080;
const PAD = 48;
const MAX_TEXT_W = SHARE_W - PAD * 2;

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

const F = {
  eyebrow:
    '600 26px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  score:
    '700 150px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  scorePct:
    '600 58px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  meta: '26px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  body: '30px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  section:
    '600 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  footer:
    '600 28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  url: '24px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const LH = { body: 46, tight: 40 };

/**
 * Full taste match: score, sub-scores, full summary (not truncated), shared artists,
 * shared genres, unique genres — variable-height PNG (not a cropped square card).
 */
function createTasteMatchSharePngBlob(params: {
  match: TasteMatchResponse;
  youLabel: string;
  themLabel: string;
  url: string;
}): Promise<Blob | null> {
  const { match, youLabel, themLabel, url } = params;

  const measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return Promise.resolve(null);

  function estimateHeight(m: CanvasRenderingContext2D): number {
    let y = PAD;
    y += 40;
    y += 158;
    y += 44;
    m.font = F.body;
    y += wrapLines(m, match.summary, MAX_TEXT_W).length * LH.body;
    y += 28;

    const artists = match.sharedArtists.slice(0, 14);
    m.font = F.body;
    if (artists.length > 0) {
      y += 32;
      for (const a of artists) {
        const raw = `${a.name} — ${youLabel} ${a.listenCountUserA} plays · ${themLabel} ${a.listenCountUserB} plays`;
        y += wrapLines(m, raw, MAX_TEXT_W).length * LH.tight;
      }
      y += 16;
    }

    const genres = match.sharedGenres.slice(0, 12);
    if (genres.length > 0) {
      y += 32;
      for (const g of genres) {
        const raw = `${g.name} — ${youLabel} ${Math.round(g.weightUserA)}% · ${themLabel} ${Math.round(g.weightUserB)}%`;
        y += wrapLines(m, raw, MAX_TEXT_W).length * LH.tight;
      }
      y += 16;
    }

    const ua = match.uniqueGenresUserA.slice(0, 8);
    const ub = match.uniqueGenresUserB.slice(0, 8);
    if (ua.length > 0) {
      y += 32;
      for (const g of ua) {
        const raw = `${g.name} — ${Math.round(g.weight)}%`;
        y += wrapLines(m, raw, MAX_TEXT_W).length * LH.tight;
      }
      y += 16;
    }
    if (ub.length > 0) {
      y += 32;
      for (const g of ub) {
        const raw = `${g.name} — ${Math.round(g.weight)}%`;
        y += wrapLines(m, raw, MAX_TEXT_W).length * LH.tight;
      }
      y += 16;
    }

    y += 48;
    y += 40;
    m.font = F.url;
    y += wrapLines(m, url, MAX_TEXT_W).length * 30;
    y += PAD + 32;
    return Math.max(y, 1080);
  }

  const H = estimateHeight(measureCtx);

  const canvas = document.createElement("canvas");
  canvas.width = SHARE_W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);

  const grd = ctx.createLinearGradient(0, 0, SHARE_W, H);
  grd.addColorStop(0, "rgb(6, 78, 59)");
  grd.addColorStop(0.38, "rgb(9, 9, 11)");
  grd.addColorStop(1, "rgb(46, 16, 101)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, SHARE_W, H);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  let y = PAD;

  ctx.fillStyle = "#a1a1aa";
  ctx.font = F.eyebrow;
  ctx.fillText("TASTE MATCH", PAD, y);
  y += 40;

  const scoreStr = String(match.score);
  ctx.fillStyle = "#ffffff";
  ctx.font = F.score;
  ctx.fillText(scoreStr, PAD, y);
  const scoreW = ctx.measureText(scoreStr).width;
  ctx.fillStyle = "#71717a";
  ctx.font = F.scorePct;
  ctx.fillText("%", PAD + scoreW + 10, y + 28);
  y += 158;

  ctx.fillStyle = "#a1a1aa";
  ctx.font = F.meta;
  const metaLine = `Overlap ${Math.round(match.overlapScore)}% · Genre ${Math.round(match.genreOverlapScore)}% · Discovery ${Math.round(match.discoveryScore)}%`;
  ctx.fillText(metaLine, PAD, y);
  y += 44;

  ctx.fillStyle = "#e4e4e7";
  ctx.font = F.body;
  for (const line of wrapLines(ctx, match.summary, MAX_TEXT_W)) {
    ctx.fillText(line, PAD, y);
    y += LH.body;
  }
  y += 28;

  const artists = match.sharedArtists.slice(0, 14);
  if (artists.length > 0) {
    ctx.fillStyle = "#d4d4d8";
    ctx.font = F.section;
    ctx.fillText("SHARED ARTISTS", PAD, y);
    y += 32;
    ctx.font = F.body;
    ctx.fillStyle = "#e4e4e7";
    for (const a of artists) {
      const raw = `${a.name} — ${youLabel} ${a.listenCountUserA} plays · ${themLabel} ${a.listenCountUserB} plays`;
      for (const line of wrapLines(ctx, raw, MAX_TEXT_W)) {
        ctx.fillText(line, PAD, y);
        y += LH.tight;
      }
    }
    y += 16;
  }

  const genres = match.sharedGenres.slice(0, 12);
  if (genres.length > 0) {
    ctx.fillStyle = "#d4d4d8";
    ctx.font = F.section;
    ctx.fillText("SHARED GENRES", PAD, y);
    y += 32;
    ctx.font = F.body;
    ctx.fillStyle = "#e4e4e7";
    for (const g of genres) {
      const raw = `${g.name} — ${youLabel} ${Math.round(g.weightUserA)}% · ${themLabel} ${Math.round(g.weightUserB)}%`;
      for (const line of wrapLines(ctx, raw, MAX_TEXT_W)) {
        ctx.fillText(line, PAD, y);
        y += LH.tight;
      }
    }
    y += 16;
  }

  const ua = match.uniqueGenresUserA.slice(0, 8);
  const ub = match.uniqueGenresUserB.slice(0, 8);
  if (ua.length > 0) {
    ctx.fillStyle = "#d4d4d8";
    ctx.font = F.section;
    ctx.fillText(`ONLY ON ${youLabel.toUpperCase()}`, PAD, y);
    y += 32;
    ctx.font = F.body;
    ctx.fillStyle = "#e4e4e7";
    for (const g of ua) {
      const raw = `${g.name} — ${Math.round(g.weight)}%`;
      for (const line of wrapLines(ctx, raw, MAX_TEXT_W)) {
        ctx.fillText(line, PAD, y);
        y += LH.tight;
      }
    }
    y += 16;
  }
  if (ub.length > 0) {
    ctx.fillStyle = "#d4d4d8";
    ctx.font = F.section;
    ctx.fillText(`ONLY ON ${themLabel.toUpperCase()}`, PAD, y);
    y += 32;
    ctx.font = F.body;
    ctx.fillStyle = "#e4e4e7";
    for (const g of ub) {
      const raw = `${g.name} — ${Math.round(g.weight)}%`;
      for (const line of wrapLines(ctx, raw, MAX_TEXT_W)) {
        ctx.fillText(line, PAD, y);
        y += LH.tight;
      }
    }
    y += 16;
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, y + 12);
  ctx.lineTo(SHARE_W - PAD, y + 12);
  ctx.stroke();
  y += 48;

  ctx.fillStyle = "#ffffff";
  ctx.font = F.footer;
  ctx.fillText("Tracklist", PAD, y);
  y += 40;

  ctx.fillStyle = "#6ee7b7";
  ctx.font = F.url;
  for (const line of wrapLines(ctx, url, MAX_TEXT_W)) {
    ctx.fillText(line, PAD, y);
    y += 30;
  }

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png", 1);
  });
}

export function TasteMatchSocialActions({
  profileUserId,
  shareSnapshot,
}: {
  profileUserId: string;
  /** Full API payload so the exported PNG mirrors the on-screen taste match. */
  shareSnapshot: {
    match: TasteMatchResponse;
    youLabel: string;
    themLabel: string;
  };
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
        match: shareSnapshot.match,
        youLabel: shareSnapshot.youLabel,
        themLabel: shareSnapshot.themLabel,
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
        "Compare our listening on Tracklist — open the link for the live breakdown.";

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
  }, [imageBusy, profileUserId, shareSnapshot, toast]);

  return (
    <>
      <div className="mt-8 border-t border-white/5 pt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Connect
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          {SOCIAL_INBOX_AND_MUSIC_REC_UI_ENABLED
            ? "Send a recommendation, share a link, or export a full taste match image for DMs or stories."
            : "Share a link or export a full taste match image for DMs or stories."}
        </p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {SOCIAL_INBOX_AND_MUSIC_REC_UI_ENABLED ? (
            <button
              type="button"
              onClick={() => setRecOpen(true)}
              className={btn}
              title="Send them an artist, album, or track"
            >
              Send Rec
            </button>
          ) : null}
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
            title="PNG with score, summary, shared artists & genres, and differences"
          >
            {imageBusy ? "Making image…" : "Share image"}
          </button>
        </div>
      </div>
      {SOCIAL_INBOX_AND_MUSIC_REC_UI_ENABLED && recOpen ? (
        <SendRecommendationModal
          recipientUserId={profileUserId}
          onClose={() => setRecOpen(false)}
        />
      ) : null}
    </>
  );
}
