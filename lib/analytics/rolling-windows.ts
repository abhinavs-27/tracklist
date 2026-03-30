import "server-only";

const MS_7D = 7 * 24 * 60 * 60 * 1000;

export type Rolling7dWindow = {
  startIso: string;
  endExclusiveIso: string;
};

export type Rolling7dVsPrior7d = {
  current: Rolling7dWindow;
  previous: Rolling7dWindow;
  /** Stable copy for pulse / narrative headers */
  rangeCaption: string;
  /** Short label for top lists (albums, tracks, etc.) */
  rangeLabel: string;
};

/**
 * Rolling **last 7 days** vs **previous 7 days** (UTC instants).
 * Current window: [now − 7d, now). Previous: [now − 14d, now − 7d).
 */
export function getRolling7dVsPrior7dBounds(now: Date = new Date()): Rolling7dVsPrior7d {
  const endMs = now.getTime();
  const currentStartMs = endMs - MS_7D;
  const previousEndMs = currentStartMs;
  const previousStartMs = previousEndMs - MS_7D;

  const current: Rolling7dWindow = {
    startIso: new Date(currentStartMs).toISOString(),
    endExclusiveIso: new Date(endMs).toISOString(),
  };
  const previous: Rolling7dWindow = {
    startIso: new Date(previousStartMs).toISOString(),
    endExclusiveIso: new Date(previousEndMs).toISOString(),
  };

  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const curStart = new Date(current.startIso);
  const curEnd = new Date(current.endExclusiveIso);
  const rangeLabel = `${fmt(curStart)}–${fmt(curEnd)} · UTC`;

  return {
    current,
    previous,
    rangeCaption: "Last 7 days · vs prior 7 days (UTC)",
    rangeLabel,
  };
}
