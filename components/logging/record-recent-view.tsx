"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import type { RecentViewItem } from "@/lib/logging/types";
import { useRecentViews } from "./recent-views-provider";

type Props = RecentViewItem;

/**
 * Records a visit for the “Pick up where you left off” strip on the feed.
 */
export function RecordRecentView({
  kind,
  id,
  title,
  subtitle,
  artworkUrl,
  trackId,
  albumId,
  artistId,
}: Props) {
  const { data: session } = useSession();
  const { recordView } = useRecentViews();

  useEffect(() => {
    if (!session?.user?.id) return;
    recordView({
      kind,
      id,
      title,
      subtitle,
      artworkUrl,
      trackId,
      albumId,
      artistId,
    });
  }, [
    session?.user?.id,
    kind,
    id,
    title,
    subtitle,
    artworkUrl,
    trackId,
    albumId,
    artistId,
    recordView,
  ]);

  return null;
}
