"use client";

import { useState } from "react";
import type { ListeningReportShareCardRow } from "@/components/reports/listening-report-share-card";
import { ListeningReportShareImageModal } from "@/components/reports/listening-report-share-image";

type Item = {
  rank: number;
  name: string;
  image: string | null;
  count: number;
};

export function SharedReportShareButton(props: {
  reportId: string;
  reportTitle: string;
  periodLabel: string;
  entityType: string;
  items: Item[];
}) {
  const [open, setOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const entityLabel =
    props.entityType.charAt(0).toUpperCase() + props.entityType.slice(1);
  const rows: ListeningReportShareCardRow[] = props.items
    .slice(0, 5)
    .map((r) => ({
      rank: r.rank,
      name: r.name,
      image: r.image,
      count: r.count,
    }));

  function handleOpen() {
    setShareUrl(
      `${typeof window !== "undefined" ? window.location.origin : ""}/reports/shared/${props.reportId}`,
    );
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-600 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-800"
      >
        Share image
      </button>
      <ListeningReportShareImageModal
        open={open}
        onClose={() => {
          setOpen(false);
          setShareUrl(null);
        }}
        reportTitle={props.reportTitle}
        periodLabel={props.periodLabel}
        entityLabel={entityLabel}
        rows={rows}
        shareUrl={shareUrl}
      />
    </>
  );
}
