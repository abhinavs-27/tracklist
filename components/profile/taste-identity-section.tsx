import { getTasteIdentity } from "@/lib/taste/taste-identity";
import { TasteIdentityDisplay } from "./taste-identity-display";

export async function TasteIdentitySection({ userId }: { userId: string }) {
  const data = await getTasteIdentity(userId);
  return <TasteIdentityDisplay data={data} />;
}
