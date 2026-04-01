import "server-only";

import {
  currentMonthStart,
  currentWeekStart,
  currentYear,
  previousCalendarYear,
  previousMonthStart,
  previousWeekStart,
} from "@/lib/analytics/period-now";

/** Inclusive YYYY-MM-DD (UTC calendar). */
export type InclusiveDateRange = { start: string; end: string };

/**
 * Converts inclusive [startDate, endDate] to [startInclusive, endExclusive) as ISO strings for `logs.listened_at`.
 */
export function inclusiveRangeToListenWindow(args: {
  startDate: string;
  endDate: string;
}): { startIso: string; endExclusiveIso: string } {
  const start = new Date(`${args.startDate}T00:00:00.000Z`);
  const endExclusive = new Date(`${args.endDate}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(endExclusive.getTime())) {
    throw new Error("invalid date range");
  }
  if (endExclusive <= start) {
    throw new Error("end must be on or after start");
  }
  return { startIso: start.toISOString(), endExclusiveIso: endExclusive.toISOString() };
}

/** Preset period as inclusive UTC dates (week = Monday–Sunday). */
export function listeningReportInclusiveBoundsForPreset(
  range: "week" | "month" | "year",
): InclusiveDateRange {
  if (range === "week") {
    const ws = currentWeekStart();
    const start = new Date(`${ws}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { start: ws, end: end.toISOString().slice(0, 10) };
  }
  if (range === "month") {
    const ms = currentMonthStart();
    const parts = ms.split("-");
    const y = Number(parts[0]);
    const mo = Number(parts[1]);
    const end = new Date(Date.UTC(y, mo, 0));
    return { start: ms, end: end.toISOString().slice(0, 10) };
  }
  const y = currentYear();
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

function previousInclusiveRangeForPreset(
  range: "week" | "month" | "year",
  current: InclusiveDateRange,
): InclusiveDateRange {
  if (range === "week") {
    const prevStart = previousWeekStart(current.start);
    const start = new Date(`${prevStart}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { start: prevStart, end: end.toISOString().slice(0, 10) };
  }
  if (range === "month") {
    const prev = previousMonthStart(current.start);
    const parts = prev.split("-");
    const y = Number(parts[0]);
    const mo = Number(parts[1]);
    const end = new Date(Date.UTC(y, mo, 0));
    return { start: prev, end: end.toISOString().slice(0, 10) };
  }
  const y = previousCalendarYear(Number(current.start.slice(0, 4)));
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

function previousCustomWindowExclusive(args: {
  startInclusive: Date;
  endExclusive: Date;
}): { startInclusive: Date; endExclusive: Date } {
  const spanMs = args.endExclusive.getTime() - args.startInclusive.getTime();
  const prevEndExclusive = new Date(args.startInclusive.getTime());
  const prevStartInclusive = new Date(prevEndExclusive.getTime() - spanMs);
  return { startInclusive: prevStartInclusive, endExclusive: prevEndExclusive };
}

export function previousCustomInclusiveRange(args: {
  startDate: string;
  endDate: string;
}): InclusiveDateRange {
  const startInclusive = new Date(`${args.startDate}T00:00:00.000Z`);
  const endExclusive = new Date(`${args.endDate}T00:00:00.000Z`);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
  const { startInclusive: pStart, endExclusive: pEndEx } =
    previousCustomWindowExclusive({ startInclusive, endExclusive });
  const prevEndInclusive = new Date(pEndEx.getTime() - 1);
  return {
    start: pStart.toISOString().slice(0, 10),
    end: prevEndInclusive.toISOString().slice(0, 10),
  };
}

/** Previous comparison window (same length as custom; prior week/month/year for presets). */
export function previousListeningReportInclusiveRange(args: {
  range: "week" | "month" | "year" | "custom";
  current: InclusiveDateRange;
  customStart?: string;
  customEnd?: string;
}): InclusiveDateRange {
  if (args.range === "custom") {
    if (!args.customStart || !args.customEnd) {
      throw new Error("custom range requires start and end");
    }
    return previousCustomInclusiveRange({
      startDate: args.customStart,
      endDate: args.customEnd,
    });
  }
  return previousInclusiveRangeForPreset(args.range, args.current);
}
