/**
 * Parse `week` from job payloads into [weekStart, weekEndExclusive) (UTC Sunday week).
 */
export function parseBillboardWeek(weekIso: string): {
  weekStart: Date;
  weekEndExclusive: Date;
} {
  const weekStart = new Date(weekIso);
  if (Number.isNaN(weekStart.getTime())) {
    throw new Error(`Invalid week ISO: ${weekIso}`);
  }
  const weekEndExclusive = new Date(weekStart);
  weekEndExclusive.setUTCDate(weekEndExclusive.getUTCDate() + 7);
  return { weekStart, weekEndExclusive };
}
