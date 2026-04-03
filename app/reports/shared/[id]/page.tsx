import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import {
  getListeningReports,
  listeningReportsResultFromSnapshot,
} from "@/lib/analytics/getListeningReports";
import type { ReportEntityType, ReportRange } from "@/lib/analytics/listening-report-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { contentMax2xl } from "@/lib/ui/layout";
import { getSavedReportById, parseListeningReportSnapshot } from "@/lib/reports/saved-report";
import { SharedReportPublicLink } from "./shared-report-public-link";
import { SharedReportShareButton } from "./shared-report-share-button";
import { SharedListeningReportView } from "./shared-listening-report-view";
import { SharedReportViewerCta } from "./shared-report-viewer-cta";

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

  const snap = parseListeningReportSnapshot(row.snapshot_json);
  const data = snap
    ? listeningReportsResultFromSnapshot({
        snapshot: snap,
        entityType: row.entity_type as ReportEntityType,
        range: row.range_type as ReportRange,
        limit: 100,
        offset: 0,
      })
    : await getListeningReports({
        userId: row.user_id,
        entityType: row.entity_type as ReportEntityType,
        range: "custom",
        startDate: row.start_date,
        endDate: row.end_date,
        limit: 100,
        offset: 0,
      });

  if (!data) notFound();

  const admin = createSupabaseAdminClient();
  const { data: owner } = await admin
    .from("users")
    .select("id, username, avatar_url")
    .eq("id", row.user_id)
    .maybeSingle();

  const ownerRow = owner as
    | { id: string; username: string; avatar_url: string | null }
    | null;

  const viewerIsLoggedIn = !!session?.user?.id;
  const viewerIsOwner = session?.user?.id === row.user_id;
  const callbackPath = `/reports/shared/${id}`;

  return (
    <div className={`${contentMax2xl} space-y-6 py-8`}>
      <Link href="/reports/listening" className="text-sm text-emerald-400 hover:underline">
        ← Listening reports
      </Link>

      <SharedReportViewerCta
        viewerIsLoggedIn={viewerIsLoggedIn}
        callbackPath={callbackPath}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            {ownerRow?.avatar_url ? (
              <img
                src={ownerRow.avatar_url}
                alt=""
                className="h-11 w-11 shrink-0 rounded-full border border-zinc-700 object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-sm font-semibold text-zinc-400">
                {(ownerRow?.username ?? "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Listening report
              </p>
              <p className="truncate text-sm text-zinc-300">
                {ownerRow ? (
                  <>
                    <span className="text-zinc-500">By </span>
                    <Link
                      href={`/profile/${ownerRow.username}`}
                      className="font-semibold text-emerald-400 hover:underline"
                    >
                      @{ownerRow.username}
                    </Link>
                  </>
                ) : (
                  <span className="text-zinc-500">By a Tracklist member</span>
                )}
                {viewerIsOwner ? (
                  <span className="ml-2 text-xs font-normal text-zinc-600">
                    (you)
                  </span>
                ) : null}
              </p>
            </div>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-white">{row.name}</h1>
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
      <SharedReportPublicLink reportId={row.id} isPublic={row.is_public} />
      <SharedListeningReportView payload={data} readOnly />
    </div>
  );
}
