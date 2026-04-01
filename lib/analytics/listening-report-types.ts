export type ReportEntityType = "artist" | "album" | "track" | "genre";
export type ReportRange = "week" | "month" | "year" | "custom";

export type ListeningReportItem = {
  entityId: string;
  name: string;
  image: string | null;
  count: number;
  /** 1-based rank within the full sorted list for this period. */
  rank: number;
  /** 1-based rank in the previous period, if the entity appeared there. */
  previousRank: number | null;
  /** Positive = moved up in rank. `previousRank - rank`. Null if new or no prior period. */
  movement: number | null;
  /** True if the entity had no plays in the comparison period. */
  isNew: boolean;
};

export type ListeningReportsResult = {
  items: ListeningReportItem[];
  range: ReportRange;
  /** ISO bounds (inclusive start, exclusive end for custom) */
  periodLabel: string;
  nextOffset: number | null;
};

/** Stored when saving a report so shared/history views never recompute. */
export type ListeningReportSnapshotV1 = {
  v: 1;
  periodLabel: string;
  totals: { totalPlays: number };
  itemsByType: Record<ReportEntityType, ListeningReportItem[]>;
};
