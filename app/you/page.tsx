import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function YouHubPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/you");
  }
  redirect(`/profile/${session.user.id}`);
}
