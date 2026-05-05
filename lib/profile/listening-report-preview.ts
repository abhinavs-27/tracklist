import "server-only";

import { getListeningReports } from "@/lib/analytics/getListeningReports";

export type ListeningReportPreviewArtist = {
  name: string;
  count: number;
  image: string | null;
};

export type ListeningReportPreviewData = {
  periodLabel: string;
  topArtists: ListeningReportPreviewArtist[];
  topGenre: { name: string; count: number } | null;
  totalPlays: number;
};

/**
 * Lightweight weekly snapshot for profile (parallel to full Listening reports).
 */
export async function getListeningReportPreview(
  userId: string,
): Promise<ListeningReportPreviewData | null> {
  const [artistReport, genreReport] = await Promise.all([
    getListeningReports({
      userId,
      range: "week",
      entityType: "artist",
      limit: 3,
    }),
    getListeningReports({
      userId,
      range: "week",
      entityType: "genre",
      limit: 1,
    }),
  ]);

  const artists = artistReport?.items ?? [];
  const g0 = genreReport?.items?.[0];

  if (artists.length === 0 && !g0) return null;

  const periodLabel =
    artistReport?.periodLabel ?? genreReport?.periodLabel ?? "This week";

  const totalPlays = artists.reduce((sum, a) => sum + a.count, 0);

  return {
    periodLabel,
    topArtists: artists.map((a) => ({ name: a.name, count: a.count, image: a.image })),
    topGenre: g0 ? { name: g0.name, count: g0.count } : null,
    totalPlays,
  };
}
