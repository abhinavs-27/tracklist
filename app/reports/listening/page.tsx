import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { contentMax2xl } from "@/lib/ui/layout";
import { LIMITS } from "@/lib/validation";
import { ListeningReportsClient } from "./listening-reports-client";

export default async function ListeningReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/reports/listening");
  }

  return (
    <div className={`${contentMax2xl} space-y-8 py-8`}>
      <Link href="/you" className="text-sm text-emerald-400 hover:underline">
        ← You
      </Link>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-bold text-white">Listening reports</h1>
        <Link
          href="/reports/week"
          className="text-sm text-zinc-500 hover:text-emerald-400 hover:underline"
        >
          Weekly story →
        </Link>
      </div>
      <p className="text-sm text-zinc-500">
        Top artists, albums, tracks, and genres. Preset ranges use daily rollups;
        custom ranges scan your recent logs (up to {LIMITS.REPORTS_CUSTOM_MAX_DAYS}{" "}
        days).
      </p>
      <ListeningReportsClient userId={session.user.id} />
    </div>
  );
}
