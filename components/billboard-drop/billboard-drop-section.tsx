import { getBillboardDropStatus } from "@/lib/billboard-drop/billboard-drop-state";
import { BillboardDropRoot } from "@/components/billboard-drop/billboard-drop-root";

export async function BillboardDropSection({ userId }: { userId: string }) {
  const initial = await getBillboardDropStatus(userId);
  return <BillboardDropRoot initial={initial} />;
}
