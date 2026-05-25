import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import {
  getListeningReports,
  listeningReportsResultFromSnapshot,
} from "@/lib/analytics/getListeningReports";
import type { ReportEntityType, ReportRange } from "@/lib/analytics/listening-report-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { contentMax2xl } from "@/lib/ui/layout";
import { getSavedReportById, parseListeningReportSnapshot } from "@/lib/reports/saved-report";
import { FollowButton } from "@/components/follow-button";
import { SharedReportShareButton } from "./shared-report-share-button";
import { SharedReportCopyLinkButton } from "./shared-report-copy-link-button";
import { SharedListeningReportView } from "./shared-listening-report-view";
import { SharedReportViewerCta } from "./shared-report-viewer-cta";

type PageParams = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { id } = await params;
  const row = await getSavedReportById(id);
  if (!row?.is_public) return { title: "Listening report · Tracklist" };

  const admin = createSupabaseAdminClient();
  const { data: owner } = await admin
    .from("users")
    .select("username")
    .eq("id", row.user_id)
    .maybeSingle();

  const snap = parseListeningReportSnapshot(row.snapshot_json);
  const entityType = row.entity_type as ReportEntityType;
  const ownerHandle = owner?.username ? `@${owner.username}` : "A Tracklist member";
  const title = `${ownerHandle}'s top ${entityType}s · Tracklist`;

  let description = `${ownerHandle} shared their top ${entityType}s on Tracklist.`;
  let ogImageUrl: string | undefined;

  if (snap) {
    const items = snap.itemsByType[entityType]?.slice(0, 3) ?? [];
    if (items.length) {
      description = items.map((i, idx) => `${idx + 1}. ${i.name} (${i.count} plays)`).join(" · ");
    }
    ogImageUrl = snap.itemsByType[entityType]?.[0]?.image ?? undefined;
  }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(ogImageUrl ? { images: [{ url: ogImageUrl }] } : {}),
    },
    twitter: {
      card: ogImageUrl ? "summary_large_image" : "summary",
      title,
      description,
      ...(ogImageUrl ? { images: [ogImageUrl] } : {}),
    },
  };
}

export default async function SharedListeningReportPage({
  params,
}: {
  params: PageParams;
}) {
  const { id } = await params;
  const session = await getSession();

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

  const ownerRow = owner as { id: string; username: string; avatar_url: string | null } | null;

  const viewerId = session?.user?.id ?? null;
  const viewerIsLoggedIn = !!viewerId;
  const viewerIsOwner = viewerId === row.user_id;
  const callbackPath = `/reports/shared/${id}`;

  // Check follow state for logged-in non-owner viewers
  let isFollowing = false;
  if (viewerIsLoggedIn && !viewerIsOwner && ownerRow) {
    const { data: followRow } = await admin
      .from("follows")
      .select("id")
      .eq("follower_id", viewerId!)
      .eq("following_id", ownerRow.id)
      .maybeSingle();
    isFollowing = !!followRow;
  }

  const entityType = row.entity_type as ReportEntityType;
  const entityLabel = entityType.charAt(0).toUpperCase() + entityType.slice(1) + "s";
  const totalPlays = snap?.totals.totalPlays ?? null;

  // Hero background: #1 item's cover art
  const heroImage = data.items[0]?.image ?? null;

  return (
    <div className={`${contentMax2xl} space-y-0 py-6`}>
      <Link href="/reports/listening" className="mb-5 inline-block text-sm text-gold-400 hover:underline">
        ← Listening reports
      </Link>

      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-800/60">
        {/* Blurred cover art background */}
        {heroImage ? (
          <img
            src={heroImage}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl"
          />
        ) : null}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-900/60 via-zinc-900/75 to-zinc-950" />

        {/* Content */}
        <div className="relative z-10 flex flex-col gap-5 px-5 py-7 sm:px-8 sm:py-9">

          {/* Owner row */}
          <div className="flex items-center justify-between gap-3">
            <Link
              href={ownerRow ? `/profile/${ownerRow.username}` : "#"}
              className="flex min-w-0 items-center gap-3 hover:opacity-90"
            >
              {ownerRow?.avatar_url ? (
                <img
                  src={ownerRow.avatar_url}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-full border border-zinc-700 object-cover"
                />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-sm font-semibold text-zinc-400">
                  {(ownerRow?.username ?? "?").slice(0, 1).toUpperCase()}
                </div>
              )}
              <span className="truncate text-sm font-semibold text-zinc-200">
                @{ownerRow?.username ?? "user"}
              </span>
            </Link>

            {/* Follow / Join */}
            {!viewerIsOwner ? (
              viewerIsLoggedIn && ownerRow ? (
                <FollowButton
                  userId={ownerRow.id}
                  initialFollowing={isFollowing}
                />
              ) : (
                <Link
                  href={`/auth/signin?callbackUrl=${encodeURIComponent(callbackPath)}`}
                  className="inline-flex shrink-0 items-center rounded-full bg-gold-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gold-500"
                >
                  Follow
                </Link>
              )
            ) : null}
          </div>

          {/* Title */}
          <div>
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl">
              {row.name}
            </h1>
          </div>

          {/* Stat pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-zinc-700/70 bg-zinc-800/60 px-2.5 py-1 text-xs font-medium text-zinc-300">
              {entityLabel}
            </span>
            <span className="rounded-full border border-zinc-700/70 bg-zinc-800/60 px-2.5 py-1 text-xs font-medium text-zinc-300">
              {data.periodLabel}
            </span>
            {totalPlays != null ? (
              <span className="rounded-full border border-zinc-700/70 bg-zinc-800/60 px-2.5 py-1 text-xs font-medium text-zinc-300">
                {totalPlays.toLocaleString()} plays
              </span>
            ) : null}
            {row.is_public ? (
              <span className="rounded-full border border-gold-800/50 bg-gold-950/40 px-2.5 py-1 text-xs font-semibold text-gold-400">
                Shared
              </span>
            ) : null}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <SharedReportShareButton
              reportId={row.id}
              reportTitle={row.name}
              periodLabel={data.periodLabel}
              entityType={row.entity_type}
              ownerHandle={ownerRow?.username ?? null}
              totalPlays={totalPlays}
              items={data.items.map((i) => ({
                rank: i.rank,
                name: i.name,
                image: i.image,
                count: i.count,
              }))}
            />
            <SharedReportCopyLinkButton reportId={row.id} isPublic={row.is_public} />
          </div>
        </div>
      </div>

      {/* ── Ranked list ── */}
      <div className="mt-6">
        <SharedListeningReportView payload={data} readOnly />
      </div>

      {/* ── Bottom CTA (logged-out) ── */}
      <div className="mt-8">
        <SharedReportViewerCta
          viewerIsLoggedIn={viewerIsLoggedIn}
          callbackPath={callbackPath}
        />
      </div>
    </div>
  );
}
