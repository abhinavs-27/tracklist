import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatJobAlert, sendJobAlert } from "./alert";

describe("formatJobAlert", () => {
  it("builds a subject and body with job name, kind, and detail", () => {
    const { subject, body } = formatJobAlert({
      jobName: "listening_aggregates",
      kind: "error",
      detail: "boom",
    });
    expect(subject).toContain("listening_aggregates");
    expect(subject.toLowerCase()).toContain("error");
    expect(body).toContain("boom");
    expect(body).toContain("listening_aggregates");
  });
});

describe("sendJobAlert", () => {
  const prev = { ...process.env };
  beforeEach(() => {
    delete process.env.JOB_ALERT_SLACK_WEBHOOK;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    delete process.env.JOB_ALERT_EMAIL;
    vi.restoreAllMocks();
  });
  afterEach(() => {
    process.env = { ...prev };
  });

  it("no-ops (returns false) when no alert channel is configured", async () => {
    const sent = await sendJobAlert({ jobName: "x", kind: "error", detail: "y" });
    expect(sent).toBe(false);
  });

  it("posts to Slack webhook when configured", async () => {
    process.env.JOB_ALERT_SLACK_WEBHOOK = "https://hooks.slack.example/abc";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const sent = await sendJobAlert({ jobName: "job_b", kind: "stale", detail: "3h ago" });
    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.slack.example/abc",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.text).toContain("job_b");
  });

  it("sends via Resend email when Slack is absent but email is configured", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "alerts@tracklistsocial.com";
    process.env.JOB_ALERT_EMAIL = "me@example.com";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const sent = await sendJobAlert({ jobName: "job_c", kind: "error", detail: "kaboom" });
    expect(sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns false and swallows errors when the channel throws", async () => {
    process.env.JOB_ALERT_SLACK_WEBHOOK = "https://hooks.slack.example/abc";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const sent = await sendJobAlert({ jobName: "x", kind: "error", detail: "y" });
    expect(sent).toBe(false);
  });
});
