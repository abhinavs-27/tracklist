"use client";

import { useCallback, useEffect, useState } from "react";
import type { CommunityMemberRosterEntry } from "@/lib/community/community-member-roster-types";
import { CommunityMembersGrid } from "@/components/community/community-members-grid";
import {
  communityBody,
  communityButton,
  communityCard,
  communityHeadline,
  communityMeta,
} from "@/lib/ui/surface";

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
    return <p className={`${communityBody} text-zinc-500`}>No members to show yet.</p>;
  }

  return (
    <section className="space-y-3">
      <details
        className={`group ${communityCard} bg-zinc-950/35 p-0`}
        onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-5 text-left transition hover:bg-zinc-900/30 sm:px-6 sm:py-5 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <h2 className={communityHeadline}>People in this community</h2>
            <p className={`mt-1.5 ${communityMeta}`}>
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
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900/80 text-zinc-400 ring-1 ring-white/[0.08] transition-transform duration-200 ${
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

        <div className="px-5 pb-6 pt-2 sm:px-6">
          <CommunityMembersGrid
            communityId={communityId}
            viewerId={viewerId}
            roster={roster}
            showPromote={showPromote}
          />
          {totalPages > 1 ? (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => void goToPage(page - 1)}
                disabled={page <= 1 || loading}
                className={communityButton}
              >
                {loading ? "Loading…" : "Previous"}
              </button>
              <span className={`tabular-nums ${communityMeta}`}>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => void goToPage(page + 1)}
                disabled={page >= totalPages || loading}
                className={communityButton}
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
