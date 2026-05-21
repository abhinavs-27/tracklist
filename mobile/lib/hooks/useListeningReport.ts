import { useQuery } from "@tanstack/react-query";
import { fetcher } from "@/lib/api";
import { useAuth } from "./useAuth";

export type ReportRange = "week" | "month" | "year" | "custom";
export type ReportEntityType = "artist" | "album" | "track" | "genre";

export type ReportItem = {
  entityId: string;
  name: string;
  image: string | null;
  count: number;
  rank: number;
  previousRank: number | null;
  movement: number | null;
  isNew: boolean;
};

export type ReportPayload = {
  items: ReportItem[];
  range: ReportRange;
  periodLabel: string;
  nextOffset: number | null;
};

export type ComparePayload = {
  totalPlaysCurrent: number;
  totalPlaysPrevious: number;
  percentChange: number | null;
  topGainer: { entityId: string; name: string } | null;
  topDropper: { entityId: string; name: string } | null;
};

type Params = {
  range: ReportRange;
  entityType: ReportEntityType;
  startDate?: string;
  endDate?: string;
  offset?: number;
  limit?: number;
};

function buildReportUrl(userId: string, params: Params): string {
  const q = new URLSearchParams({
    userId,
    type: params.entityType,
    range: params.range,
    limit: String(params.limit ?? 50),
    offset: String(params.offset ?? 0),
  });
  if (params.range === "custom" && params.startDate) q.set("startDate", params.startDate);
  if (params.range === "custom" && params.endDate) q.set("endDate", params.endDate);
  return `/api/reports?${q.toString()}`;
}

function buildCompareUrl(userId: string, params: Params): string {
  const q = new URLSearchParams({
    userId,
    type: params.entityType,
    range: params.range,
  });
  if (params.range === "custom" && params.startDate) q.set("startDate", params.startDate);
  if (params.range === "custom" && params.endDate) q.set("endDate", params.endDate);
  return `/api/reports/compare?${q.toString()}`;
}

export function useListeningReport(params: Params) {
  const { session, isLoading: authLoading } = useAuth();
  const userId = session?.user?.id ?? null;

  const enabled =
    !!userId &&
    !authLoading &&
    (params.range !== "custom" || (!!params.startDate && !!params.endDate));

  const report = useQuery<ReportPayload>({
    queryKey: ["listening-report", userId, params.range, params.entityType, params.startDate, params.endDate, params.offset],
    queryFn: () => fetcher<ReportPayload>(buildReportUrl(userId!, params)),
    enabled,
    staleTime: 2 * 60 * 1000,
  });

  const compare = useQuery<ComparePayload>({
    queryKey: ["listening-report-compare", userId, params.range, params.entityType, params.startDate, params.endDate],
    queryFn: () => fetcher<ComparePayload>(buildCompareUrl(userId!, params)),
    enabled: enabled && params.range !== "custom",
    staleTime: 2 * 60 * 1000,
  });

  return { report, compare };
}
