import { getListeningInsights } from "@/lib/taste/listening-insights";
import { ListeningInsights } from "./ListeningInsights";

export async function ListeningInsightsSection({ userId }: { userId: string }) {
  const data = await getListeningInsights(userId);
  return <ListeningInsights data={data} />;
}
