import { useQuery } from "@tanstack/react-query";
import { fetcher } from "../api";

export type BillboardDropHighlights = {
  weekLabel: string;
  weekStart: string;
  numberOneTitle: string;
  numberOneArtist: string | null;
  newEntriesCount: number;
  weeksAtNumberOne: number;
  biggestMoverTitle: string | null;
  biggestMoverDelta: number | null;
};

export type BillboardDropStatus = {
  hasChart: boolean;
  shouldShowModal: boolean;
  showBanner: boolean;
  highlights: BillboardDropHighlights | null;
  communityCount: number;
};

export function useBillboardDrop() {
  return useQuery<BillboardDropStatus>({
    queryKey: ["billboard-drop"],
    queryFn: () => fetcher<BillboardDropStatus>("/api/me/billboard-drop"),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}
