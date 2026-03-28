import type { TasteIdentity } from "@/lib/taste/types";
import { getTasteIdentity } from "@/lib/taste/taste-identity";
import { TasteIdentityDisplay } from "./taste-identity-display";

export async function TasteIdentitySection({
  userId,
  hubMode = false,
  initialData,
}: {
  userId: string;
  hubMode?: boolean;
  initialData?: TasteIdentity;
}) {
  const data = initialData ?? (await getTasteIdentity(userId));
  return <TasteIdentityDisplay data={data} hubMode={hubMode} />;
}
