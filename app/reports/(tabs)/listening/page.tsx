import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LIMITS } from "@/lib/validation";
import { ListeningReportsClient } from "./listening-reports-client";

export default async function ListeningReportsPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/reports/listening");
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-500">
        Top artists, albums, tracks, and genres. Preset ranges use daily
        rollups; custom ranges scan your recent logs (up to{" "}
        {LIMITS.REPORTS_CUSTOM_MAX_DAYS} days).
      </p>
      <ListeningReportsClient
        userId={session.user.id}
        username={session.user.username}
      />
    </div>
  );
}
