import "server-only";

import { getAppBaseUrl } from "@/lib/app-url";
import { getWeeklyChartForUser } from "@/lib/charts/get-user-weekly-chart";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Email clients prefer https; skip broken or non-URL values. */
function safeTrackImageUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t.startsWith("https://")) return null;
  return t;
}

export type SendBillboardWeeklyEmailResult =
  | { ok: true }
  | { ok: false; reason: string };

function parseResendErrorBody(res: Response, bodyText: string): string {
  try {
    const j = JSON.parse(bodyText) as { message?: string; name?: string };
    if (j?.message) {
      return `${res.status} ${j.name ?? "Error"}: ${j.message}`;
    }
  } catch {
    /* not JSON */
  }
  const t = bodyText.trim();
  return t ? `${res.status}: ${t}` : `HTTP ${res.status}`;
}

/**
 * Sends the weekly Billboard digest via Resend when `RESEND_API_KEY` and `RESEND_FROM` are set.
 */
export async function sendBillboardWeeklyDigestEmail(args: {
  userId: string;
  email: string;
  weekStart: string;
}): Promise<SendBillboardWeeklyEmailResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!key || !from) {
    const missing = [!key && "RESEND_API_KEY", !from && "RESEND_FROM"].filter(
      Boolean,
    );
    return {
      ok: false,
      reason: `Missing ${missing.join(" and ")}. Add them to \`.env\` in the project root (same folder as package.json), save the file, then stop and start \`next dev\` (not only hot reload). If you run Next from another directory, env files there are the ones that load.`,
    };
  }

  let chart;
  try {
    chart = await getWeeklyChartForUser({
      userId: args.userId,
      chartType: "tracks",
      weekStart: args.weekStart,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `Could not load weekly chart: ${msg}` };
  }

  if (!chart) {
    return {
      ok: false,
      reason:
        "Could not load weekly chart for this user/week (no chart row or hydration failed).",
    };
  }

  let chartUrl: string;
  try {
    const base = getAppBaseUrl();
    chartUrl = `${base}/charts`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: `App URL misconfigured (NEXTAUTH_URL / VERCEL_URL): ${msg}`,
    };
  }

  const one = chart.share.numberOne;
  const newEntries = chart.rankings.filter((r) => r.is_new).length;
  const weeksAt1 = one?.weeks_at_1 ?? 1;
  const jump = chart.movers.biggest_jump;

  const titleLine = one
    ? `${one.name}${one.artist_name ? ` — ${one.artist_name}` : ""}`
    : "Your chart is ready";

  const newEntriesLine =
    newEntries === 0
      ? "No new tracks in the top 10 — same crew as last week, different order."
      : `${newEntries} new ${newEntries === 1 ? "track" : "tracks"} in the top 10.`;
  const weeksAtLine =
    weeksAt1 <= 1
      ? "One week at #1 so far."
      : `${weeksAt1} weeks at #1.`;
  let moverTeaser = "No big swings up or down this week.";
  if (jump?.name && jump.movement != null && jump.movement !== 0) {
    const spots = Math.abs(jump.movement);
    const jn = jump.name;
    moverTeaser =
      jump.movement > 0
        ? `${jn} jumped ${spots} spot${spots === 1 ? "" : "s"}.`
        : `${jn} slid ${spots} spot${spots === 1 ? "" : "s"}.`;
  }

  const preheader = `${chart.share.weekLabel} — #1 below; full chart on Tracklist.`;

  const numberOneImageUrl = safeTrackImageUrl(one?.image ?? null);
  const imageAlt = one
    ? `${one.name}${one.artist_name ? ` — ${one.artist_name}` : ""}`
    : "Number one track";

  const tracklistLine = `The rest of your chart (ranks 2–10, moves, and last week) is on Tracklist — tap below when you’re ready.`;

  const chartUrlEscaped = escapeHtml(chartUrl);

  const imageBlock = numberOneImageUrl
    ? `
                  <tr>
                    <td style="padding:24px 28px 0;text-align:center;">
                      <a href="${chartUrlEscaped}" style="text-decoration:none;display:inline-block;">
                        <img src="${escapeHtml(numberOneImageUrl)}" alt="${escapeHtml(imageAlt)}" width="280" height="280" style="display:block;width:280px;max-width:100%;height:auto;margin:0 auto;border-radius:16px;border:0;object-fit:cover;background:#292524;" />
                      </a>
                    </td>
                  </tr>`
    : "";

  const html = `
<!DOCTYPE html>
<html>
  <body style="margin:0;background:#0c0a09;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fafafa;">
    <!-- Preheader (inbox preview; hidden in body) -->
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:transparent;">
      ${escapeHtml(preheader)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(180deg,#0c0a09 0%,#171717 50%,#0c0a09 100%);padding:36px 16px 48px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:520px;border-collapse:separate;">
            <tr>
              <td style="padding:0 0 20px;text-align:center;">
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:#fbbf24;font-weight:600;">Weekly Billboard</p>
                <p style="margin:0;font-size:15px;color:#a3a3a3;line-height:1.5;">${escapeHtml(chart.share.weekLabel)}</p>
              </td>
            </tr>
            <tr>
              <td style="background:#1c1917;border-radius:20px;border:1px solid rgba(251,191,36,0.15);box-shadow:0 24px 60px -20px rgba(0,0,0,0.65);overflow:hidden;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  ${imageBlock}
                  <tr>
                    <td style="padding:28px 28px 8px;background:radial-gradient(ellipse 80% 120% at 50% -20%,rgba(251,191,36,0.12),transparent);">
                      <h1 style="margin:0;font-size:24px;font-weight:700;letter-spacing:-0.02em;line-height:1.2;color:#fafaf9;">${escapeHtml(titleLine)}</h1>
                      <p style="margin:8px 0 0;font-size:13px;color:#a8a29e;text-transform:uppercase;letter-spacing:0.06em;">#1 this week</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:8px 28px 24px;">
                      <p style="margin:0;font-size:15px;color:#d6d3d1;line-height:1.65;">
                        ${escapeHtml(newEntriesLine)}
                      </p>
                      <p style="margin:14px 0 0;font-size:15px;color:#d6d3d1;line-height:1.65;">
                        ${escapeHtml(weeksAtLine)}
                      </p>
                      <p style="margin:14px 0 0;font-size:15px;color:#d6d3d1;line-height:1.65;">
                        ${escapeHtml(moverTeaser)}
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 28px 8px;text-align:center;">
                      <p style="margin:0;font-size:15px;color:#d6d3d1;line-height:1.6;">${escapeHtml(tracklistLine)}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 28px 32px;text-align:center;">
                      <a href="${chartUrlEscaped}" style="display:inline-block;background:linear-gradient(180deg,#fbbf24 0%,#f59e0b 100%);color:#1c1917;font-weight:700;text-decoration:none;padding:16px 32px;border-radius:14px;font-size:16px;letter-spacing:0.02em;box-shadow:0 12px 28px -8px rgba(251,191,36,0.45);">Open in Tracklist</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.email],
        subject: `Weekly Billboard · ${chart.share.weekLabel}`,
        html,
      }),
    });

    const errText = await res.text().catch(() => "");
    if (!res.ok) {
      const detail = parseResendErrorBody(res, errText);
      console.error("[billboard-email] Resend error", detail);
      return {
        ok: false,
        reason: `Resend rejected the request: ${detail}. Verify domain + sender in the Resend dashboard (tracklistsocial.com) and that RESEND_FROM matches an allowed address.`,
      };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[billboard-email] fetch failed", e);
    return { ok: false, reason: `Network error calling Resend: ${msg}` };
  }
}
