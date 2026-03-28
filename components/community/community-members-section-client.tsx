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
  /** When true, skip outer card and "People in this community" heading (e.g. inside a collapsible). */
  embedded?: boolean;
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
  embedded = false,
}: Props) {
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

  const grid = (
    <CommunityMembersGrid
      communityId={communityId}
      viewerId={viewerId}
      roster={roster}
      showPromote={showPromote}
    />
  );

  const pagination = (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
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
  );

  if (embedded) {
    return (
      <>
        {grid}
        {totalPages > 1 ? pagination : null}
      </>
    );
  }

  return (
    <section className={communityCard}>
      <div className="min-w-0">
        <h3 className={communityHeadline}>People in this community</h3>
        <p className={`mt-2 ${communityMeta}`}>
          {total} member{total !== 1 ? "s" : ""}
          {totalPages > 1 ? (
            <span className="text-zinc-600">
              {" "}
              · page {page} of {totalPages} ({pageSize} per page)
            </span>
          ) : null}
        </p>
      </div>

      <div className="mt-5">{grid}</div>

      {totalPages > 1 ? pagination : null}
    </section>
  );
}
