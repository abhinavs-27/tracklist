import type { ListeningInsightsResult } from "@/lib/taste/listening-insights";
import { getListeningInsights } from "@/lib/taste/listening-insights";
import { ListeningInsights } from "./ListeningInsights";

export async function ListeningInsightsSection({
  userId,
  maxLines,
  embedded,
  prefetched,
}: {
  userId: string;
  maxLines?: number;
  embedded?: boolean;
  /** When set (e.g. profile page already awaited getListeningInsights), skips duplicate fetch. */
  prefetched?: ListeningInsightsResult;
}) {
  const data =
    prefetched !== undefined
      ? prefetched
      : await getListeningInsights(userId);
  return (
    <ListeningInsights data={data} maxLines={maxLines} embedded={embedded} />
  );
}
