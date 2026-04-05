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
