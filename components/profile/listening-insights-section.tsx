import { getListeningInsights } from "@/lib/taste/listening-insights";
import { ListeningInsights } from "./ListeningInsights";

export async function ListeningInsightsSection({
  userId,
  maxLines,
  embedded,
}: {
  userId: string;
  maxLines?: number;
  embedded?: boolean;
}) {
  const data = await getListeningInsights(userId);
  return (
    <ListeningInsights data={data} maxLines={maxLines} embedded={embedded} />
  );
}
