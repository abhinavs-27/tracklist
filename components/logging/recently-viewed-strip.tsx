"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/toast";
import {
  dismissFeedPickupStrip,
  isFeedPickupStripDismissed,
} from "@/lib/logging/feed-pickup-dismiss";
import type { RecentViewItem } from "@/lib/logging/types";
import { useLogging } from "./logging-context";

type Props = {
  items: RecentViewItem[];
  /** When true (e.g. Last.fm linked), hide the strip entirely — scrobbling covers logging. */
  suppressForLastfm?: boolean;
};

export function RecentlyViewedLogStrip({
  items,
  suppressForLastfm = false,
}: Props) {
  const { logListen, logBusy } = useLogging();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(isFeedPickupStripDismissed());
  }, []);

  const slice = items.slice(0, 5);

  if (suppressForLastfm || dismissed || slice.length === 0) return null;

  return (
    <div className="mb-4 space-y-2.5">
      <div className="flex items-start justify-between gap-2 px-1">
        <h2 className="text-[15px] font-extrabold text-white">
          Pick up where you left off
        </h2>
        <button
          type="button"
          aria-label="Dismiss"
          className="-mr-1 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
          onClick={() => {
            dismissFeedPickupStrip();
            setDismissed(true);
          }}
        >
          <span className="text-lg leading-none" aria-hidden>
            ×
          </span>
        </button>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]">
        {slice.map((item) => (
          <div
            key={`${item.kind}:${item.id}`}
            className="w-[132px] shrink-0 rounded-[14px] border border-zinc-800 bg-zinc-900/80 p-2.5"
          >
            <div className="mx-auto h-[88px] w-[88px] overflow-hidden rounded-lg bg-zinc-800">
              {item.artworkUrl ? (
                <img
                  src={item.artworkUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-2xl text-zinc-600">
                  ♪
                </div>
              )}
            </div>
            <p className="mt-1.5 truncate text-[13px] font-extrabold text-white">
              {item.title}
            </p>
            <p className="truncate text-[11px] font-semibold text-zinc-500">
              {item.subtitle}
            </p>
            <button
              type="button"
              disabled={logBusy}
              onClick={async () => {
                if (logBusy) return;
                try {
                  await logListen({
                    trackId: item.trackId,
                    albumId: item.albumId ?? null,
                    artistId: item.artistId ?? null,
                    source: "suggested",
                    displayName: item.title,
                  });
                } catch {
                  toast("Couldn’t log. Try again.");
                }
              }}
              className="mt-1.5 w-full rounded-full bg-emerald-500 py-2 text-[13px] font-extrabold text-white transition hover:bg-emerald-400 disabled:opacity-60"
            >
              Log
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
