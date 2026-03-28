import "server-only";

import { getListeningReports } from "@/lib/analytics/getListeningReports";

export type ListeningReportPreviewData = {
  periodLabel: string;
  topGenre: { name: string; count: number } | null;
  topArtist: { name: string; count: number } | null;
  /** One line for the card body */
  summary: string;
};

/**
 * Lightweight weekly snapshot for profile (parallel to full Listening reports).
 */
export async function getListeningReportPreview(
  userId: string,
): Promise<ListeningReportPreviewData | null> {
  const [genreReport, artistReport] = await Promise.all([
    getListeningReports({
      userId,
      range: "week",
      entityType: "genre",
      limit: 1,
    }),
    getListeningReports({
      userId,
      range: "week",
      entityType: "artist",
      limit: 1,
    }),
  ]);

  const g0 = genreReport?.items?.[0];
  const a0 = artistReport?.items?.[0];
  if (!g0 && !a0) return null;

  const periodLabel =
    genreReport?.periodLabel ?? artistReport?.periodLabel ?? "This week";

  const topGenre = g0
    ? { name: g0.name, count: g0.count }
    : null;
  const topArtist = a0
    ? { name: a0.name, count: a0.count }
    : null;

  let summary: string;
  if (topArtist && topGenre) {
    summary = `This week ${topArtist.name} leads your plays, with ${topGenre.name} as your strongest genre.`;
  } else if (topGenre) {
    summary = `${topGenre.name} is your top genre this week — ${topGenre.count} plays in that bucket.`;
  } else if (topArtist) {
    summary = `${topArtist.name} is your most-played artist this week with ${topArtist.count} plays.`;
  } else {
    return null;
  }

  return { periodLabel, topGenre, topArtist, summary };
}
