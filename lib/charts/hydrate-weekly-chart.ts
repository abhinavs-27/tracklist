import "server-only";

import {
  UNKNOWN_ALBUM_ENTITY,
  UNKNOWN_ARTIST_ENTITY,
  UNKNOWN_TRACK_ENTITY,
} from "@/lib/analytics/build-listening-report";
import {
  getOrFetchAlbumsBatch,
  getOrFetchArtistsBatch,
  getOrFetchTracksBatch,
} from "@/lib/spotify-cache";

import type {
  ChartType,
  WeeklyChartHydratedFields,
  WeeklyChartMoverDropout,
  WeeklyChartRankingRow,
} from "@/lib/charts/weekly-chart-types";

export type HydratedWeeklyRankingRow = WeeklyChartRankingRow &
  WeeklyChartHydratedFields;

function isSynthetic(id: string): boolean {
  return id.startsWith("__tl_");
}

export async function hydrateWeeklyChartRankings(
  chartType: ChartType,
  rankings: WeeklyChartRankingRow[],
): Promise<HydratedWeeklyRankingRow[]> {
  const catalogOpts = { allowNetwork: false as const };

  if (chartType === "tracks") {
    const ids = rankings.map((r) => r.entity_id);
    const fetchIds = ids.filter((id) => !isSynthetic(id));
    const list = fetchIds.length
      ? await getOrFetchTracksBatch(fetchIds, catalogOpts)
      : [];
    const byId = new Map(
      fetchIds.map((id, i) => [id, list[i] ?? null] as const),
    );
    return rankings.map((r) => {
      if (r.entity_id === UNKNOWN_TRACK_ENTITY || isSynthetic(r.entity_id)) {
        return {
          ...r,
          name: "Unknown track",
          image: null,
          artist_name: null,
        };
      }
      const t = byId.get(r.entity_id) ?? null;
      const artistName =
        t?.artists
          ?.map((a) => a.name)
          .filter(Boolean)
          .join(", ") ?? null;
      return {
        ...r,
        name: t?.name ?? r.entity_id,
        image: t?.album?.images?.[0]?.url ?? null,
        artist_name: artistName?.trim() || null,
      };
    });
  }

  if (chartType === "albums") {
    const ids = rankings.map((r) => r.entity_id);
    const fetchIds = ids.filter((id) => !isSynthetic(id));
    const list = fetchIds.length
      ? await getOrFetchAlbumsBatch(fetchIds, catalogOpts)
      : [];
    const byId = new Map(
      fetchIds.map((id, i) => [id, list[i] ?? null] as const),
    );
    return rankings.map((r) => {
      if (r.entity_id === UNKNOWN_ALBUM_ENTITY || isSynthetic(r.entity_id)) {
        return { ...r, name: "Unknown album", image: null, artist_name: null };
      }
      const a = byId.get(r.entity_id) ?? null;
      const artistName = a?.artists?.[0]?.name ?? null;
      return {
        ...r,
        name: a?.name ?? r.entity_id,
        image: a?.images?.[0]?.url ?? null,
        artist_name: artistName?.trim() || null,
      };
    });
  }

  const ids = rankings.map((r) => r.entity_id);
  const fetchIds = ids.filter((id) => !isSynthetic(id));
  const list = fetchIds.length
    ? await getOrFetchArtistsBatch(fetchIds, catalogOpts)
    : [];
  const byId = new Map(
    fetchIds.map((id, i) => [id, list[i] ?? null] as const),
  );
  return rankings.map((r) => {
    if (r.entity_id === UNKNOWN_ARTIST_ENTITY || isSynthetic(r.entity_id)) {
      return { ...r, name: "Unknown artist", image: null, artist_name: null };
    }
    const a = byId.get(r.entity_id) ?? null;
    return {
      ...r,
      name: a?.name ?? r.entity_id,
      image: a?.images?.[0]?.url ?? null,
      artist_name: null,
    };
  });
}

export type HydratedWeeklyChartDropout = WeeklyChartMoverDropout &
  WeeklyChartHydratedFields;

export async function hydrateWeeklyChartDropout(
  chartType: ChartType,
  d: WeeklyChartMoverDropout,
): Promise<HydratedWeeklyChartDropout> {
  const synthetic: WeeklyChartRankingRow = {
    entity_id: d.entity_id,
    rank: d.prev_rank,
    play_count: 0,
    prev_rank: null,
    movement: d.movement,
    is_new: false,
    is_reentry: false,
    weeks_in_top_10: 0,
    weeks_at_1: 0,
    peak_rank: d.prev_rank,
  };
  const [h] = await hydrateWeeklyChartRankings(chartType, [synthetic]);
  return {
    kind: "dropout",
    entity_id: d.entity_id,
    prev_rank: d.prev_rank,
    movement: d.movement,
    name: h.name,
    image: h.image,
    artist_name: h.artist_name ?? null,
  };
}
