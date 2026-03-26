import { redirect } from "next/navigation";
import { isValidUuid } from "@/lib/validation";

/** Old URL; settings are inline on the community page. */
export default async function CommunitySettingsRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = rawId?.trim() ?? "";
  if (!isValidUuid(id)) redirect("/communities");
  redirect(`/communities/${id}`);
}
