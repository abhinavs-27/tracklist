"use client";

import { useCallback, useEffect, useState } from "react";
import type { CommunityMemberRosterEntry } from "@/lib/community/community-member-roster-types";
import { CommunityMembersGrid } from "@/components/community/community-members-grid";

type Props = {
  communityId: string;
  viewerId: string;
  showPromote: boolean;
  initialTotal: number;
  initialPage: number;
  initialPageSize: number;
  initialTotalPages: number;
  initialRoster: CommunityMemberRosterEntry[];
};

export function CommunityMembersSectionClient({
  communityId,
  viewerId,
  showPromote,
  initialTotal,
  initialPage,
  initialPageSize,
  initialTotalPages,
  initialRoster,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [page, setPage] = useState(initialPage);
  const [total, setTotal] = useState(initialTotal);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [roster, setRoster] = useState(initialRoster);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPage(initialPage);
    setTotal(initialTotal);
    setTotalPages(initialTotalPages);
    setPageSize(initialPageSize);
    setRoster(initialRoster);
  }, [initialPage, initialTotal, initialTotalPages, initialPageSize, initialRoster]);

  const goToPage = useCallback(
    async (next: number) => {
      if (next < 1 || next > totalPages || loading || next === page) return;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/communities/${communityId}/members?page=${next}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          roster: CommunityMemberRosterEntry[];
          total: number;
          page: number;
          pageSize: number;
          totalPages: number;
        };
        setRoster(data.roster);
        setPage(data.page);
        setTotal(data.total);
        setTotalPages(data.totalPages);
        setPageSize(data.pageSize);
      } finally {
        setLoading(false);
      }
    },
    [communityId, loading, page, totalPages],
  );

  if (total === 0) {
    return <p className="text-sm text-zinc-500">No members to show yet.</p>;
  }

  return (
    <section className="space-y-3">
      <details
        className="group rounded-2xl border border-zinc-800/90 bg-zinc-950/40 ring-1 ring-white/[0.04]"
        onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-4 text-left transition hover:bg-zinc-900/40 sm:px-5 sm:py-4 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white">
              People in this community
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              {total} member{total !== 1 ? "s" : ""}
              {totalPages > 1 ? (
                <span className="text-zinc-600">
                  {" "}
                  · page {page} of {totalPages} ({pageSize} per page)
                </span>
              ) : null}
            </p>
          </div>
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900/80 text-zinc-400 transition-transform duration-200 ${
              detailsOpen ? "rotate-180" : ""
            }`}
            aria-hidden
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </summary>

        <div className="border-t border-zinc-800/80 px-4 pb-5 pt-4 sm:px-5">
          <CommunityMembersGrid
            communityId={communityId}
            viewerId={viewerId}
            roster={roster}
            showPromote={showPromote}
          />
          {totalPages > 1 ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/80 pt-4">
              <button
                type="button"
                onClick={() => void goToPage(page - 1)}
                disabled={page <= 1 || loading}
                className="rounded-xl border border-zinc-600 bg-zinc-900/50 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Loading…" : "Previous"}
              </button>
              <span className="text-sm tabular-nums text-zinc-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => void goToPage(page + 1)}
                disabled={page >= totalPages || loading}
                className="rounded-xl border border-zinc-600 bg-zinc-900/50 px-4 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Loading…" : "Next"}
              </button>
            </div>
          ) : null}
        </div>
      </details>
    </section>
  );
}
