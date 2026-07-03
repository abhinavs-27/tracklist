import { describe, it, expect, vi, beforeEach } from "vitest";

const finish = vi.fn(async () => {});
const startJobRun = vi.fn(async () => ({ finish }));
const sendJobAlert = vi.fn(async () => true);

vi.mock("./job-logger", () => ({ startJobRun: (...a: unknown[]) => startJobRun(...a) }));
vi.mock("./alert", () => ({ sendJobAlert: (...a: unknown[]) => sendJobAlert(...a) }));

import { withJobRun } from "./with-job-run";

describe("withJobRun", () => {
  beforeEach(() => vi.clearAllMocks());

  it("records ok and returns the fn result on success", async () => {
    const result = await withJobRun("job_a", { week: "w" }, async () => ({ processed: 3 }));
    expect(result).toEqual({ processed: 3 });
    expect(startJobRun).toHaveBeenCalledWith("job_a", { week: "w" });
    expect(finish).toHaveBeenCalledWith(expect.objectContaining({ status: "ok" }));
    expect(sendJobAlert).not.toHaveBeenCalled();
  });

  it("passes through items_ok / items_failed from the result", async () => {
    await withJobRun("job_a", {}, async () => ({ items_ok: 10, items_failed: 2 }));
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ok", items_ok: 10, items_failed: 2 }),
    );
  });

  it("records error, alerts, and rethrows on failure", async () => {
    await expect(
      withJobRun("job_b", {}, async () => {
        throw new Error("kaboom");
      }),
    ).rejects.toThrow("kaboom");
    expect(finish).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }));
    expect(sendJobAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        jobName: "job_b",
        kind: "error",
        detail: expect.stringContaining("kaboom"),
      }),
    );
  });
});
