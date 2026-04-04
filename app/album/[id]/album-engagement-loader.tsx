import React from "react";
import { getAlbumEngagementStats } from "@/lib/queries";

type EngagementStats = {
  listen_count: number;
  review_count: number;
  avg_rating: number | null;
  favorite_count: number;
};

type AlbumEngagementLoaderProps = {
  albumId: string;
  children: (engagementStats: EngagementStats) => React.ReactNode;
};

export async function AlbumEngagementLoader({ albumId, children }: AlbumEngagementLoaderProps) {
  const engagementStats = await getAlbumEngagementStats(albumId);
  return <>{children(engagementStats)}</>;
}
