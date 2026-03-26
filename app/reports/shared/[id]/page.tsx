import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getListeningReports } from "@/lib/analytics/getListeningReports";
import type { ReportEntityType } from "@/lib/analytics/getListeningReports";
import { getSavedReportById } from "@/lib/reports/saved-report";
import { SharedReportShareButton } from "./shared-report-share-button";
import { SharedListeningReportView } from "./shared-listening-report-view";

type PageParams = Promise<{ id: string }>;

export default async function SharedListeningReportPage({
  params,
}: {
  params: PageParams;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  const row = await getSavedReportById(id);
  if (!row) notFound();

  const isOwner = session?.user?.id === row.user_id;
  if (!row.is_public && !isOwner) notFound();

  if (!row.start_date || !row.end_date) notFound();

  const data = await getListeningReports({
    userId: row.user_id,
    entityType: row.entity_type as ReportEntityType,
    range: "custom",
    startDate: row.start_date,
    endDate: row.end_date,
    limit: 100,
    offset: 0,
  });

  if (!data) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Link href="/reports/listening" className="text-sm text-emerald-400 hover:underline">
        ← Listening reports
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{row.name}</h1>
          <p className="text-sm text-zinc-500">
            {row.entity_type} · {row.range_type} · {data.periodLabel}
            {row.is_public ? " · Shared" : ""}
          </p>
        </div>
        <SharedReportShareButton
          reportId={row.id}
          reportTitle={row.name}
          periodLabel={data.periodLabel}
          entityType={row.entity_type}
          items={data.items.map((i) => ({
            rank: i.rank,
            name: i.name,
            image: i.image,
            count: i.count,
          }))}
        />
      </div>
      <SharedListeningReportView payload={data} readOnly />
    </div>
  );
}
