import { describe, it, expect } from "vitest";
import { classifyBatchRunStatus } from "./job-run-status";

describe("classifyBatchRunStatus", () => {
  it("is 'skipped' when nothing was processed (ran, no work)", () => {
    expect(classifyBatchRunStatus(0, 0)).toBe("skipped");
  });

  it("is 'ok' when some items fail but not all (partial failure is not a run failure)", () => {
    // The lastfm_sync bug: 701 imported, 2 dead Last.fm accounts must NOT mark the run error.
    expect(classifyBatchRunStatus(50, 2)).toBe("ok");
  });

  it("is 'ok' when everything succeeds", () => {
    expect(classifyBatchRunStatus(10, 0)).toBe("ok");
  });

  it("is 'error' only when every processed item failed (a real, total failure)", () => {
    expect(classifyBatchRunStatus(10, 10)).toBe("error");
  });
});
