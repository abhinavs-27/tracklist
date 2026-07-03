export type JobAlert = {
  jobName: string;
  kind: "error" | "stale";
  detail: string;
};

const APP_URL = process.env.PUBLIC_APP_URL?.trim() || "http://127.0.0.1:3000";

export function formatJobAlert(a: JobAlert): { subject: string; body: string } {
  const subject = `[tracklist jobs] ${a.kind.toUpperCase()}: ${a.jobName}`;
  const body =
    `Job: ${a.jobName}\n` +
    `Kind: ${a.kind}\n` +
    `Detail: ${a.detail}\n` +
    `Dashboard: ${APP_URL}/api/admin/job-runs?job=${encodeURIComponent(a.jobName)}\n`;
  return { subject, body };
}

/**
 * Sends a job alert via Slack webhook if `JOB_ALERT_SLACK_WEBHOOK` is set, else via
 * Resend email if `RESEND_API_KEY` + `RESEND_FROM` + `JOB_ALERT_EMAIL` are set.
 * Returns whether an alert was dispatched. Never throws — observability must not break jobs.
 */
export async function sendJobAlert(a: JobAlert): Promise<boolean> {
  const { subject, body } = formatJobAlert(a);
  try {
    const slack = process.env.JOB_ALERT_SLACK_WEBHOOK?.trim();
    if (slack) {
      await fetch(slack, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `*${subject}*\n\`\`\`${body}\`\`\`` }),
      });
      return true;
    }

    const key = process.env.RESEND_API_KEY?.trim();
    const from = process.env.RESEND_FROM?.trim();
    const to = process.env.JOB_ALERT_EMAIL?.trim();
    if (key && from && to) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [to], subject, text: body }),
      });
      return true;
    }

    console.warn("[job-alert] no channel configured; would send:", subject);
    return false;
  } catch (e) {
    console.warn("[job-alert] send failed", e instanceof Error ? e.message : e);
    return false;
  }
}
