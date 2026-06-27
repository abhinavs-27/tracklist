import type { BillboardJobMessage, CronJobMessage } from "@/lib/jobs/types";

export function parseBillboardJob(body: string): BillboardJobMessage {
  let j: unknown;
  try {
    j = JSON.parse(body);
  } catch {
    throw new Error("Invalid JSON body");
  }
  if (!j || typeof j !== "object") throw new Error("Body must be an object");
  const o = j as Record<string, unknown>;
  if (o.type === "GENERATE_USER_BILLBOARD") {
    if (typeof o.userId !== "string" || typeof o.week !== "string") {
      throw new Error("GENERATE_USER_BILLBOARD requires userId and week strings");
    }
    return { type: "GENERATE_USER_BILLBOARD", userId: o.userId, week: o.week };
  }
  if (o.type === "GENERATE_COMMUNITY_BILLBOARD") {
    if (typeof o.communityId !== "string" || typeof o.week !== "string") {
      throw new Error(
        "GENERATE_COMMUNITY_BILLBOARD requires communityId and week strings",
      );
    }
    return {
      type: "GENERATE_COMMUNITY_BILLBOARD",
      communityId: o.communityId,
      week: o.week,
    };
  }
  throw new Error(`Unknown billboard job type: ${String(o.type)}`);
}

export function parseCronJob(body: string): CronJobMessage {
  let j: unknown;
  try {
    j = JSON.parse(body);
  } catch {
    throw new Error("Invalid JSON body");
  }
  if (!j || typeof j !== "object") throw new Error("Body must be an object");
  const o = j as Record<string, unknown>;
  const t = o.type;
  if (typeof t !== "string") throw new Error("Missing type");

  switch (t) {
    case "REFRESH_STATS":
    case "COMPUTE_COOCCURRENCE":
    case "LASTFM_SYNC":
    case "TASTE_IDENTITY_REFRESH":
    case "BILLBOARD_WEEKLY_EMAIL":
    case "LISTENING_AGGREGATES":
    case "REFRESH_COMMUNITY_MEMBER_STATS":
      return { type: t };
    case "COMMUNITY_FEATURE_WEEKLY":
      return {
        type: "COMMUNITY_FEATURE_WEEKLY",
        limit: typeof o.limit === "number" ? o.limit : undefined,
      };
    case "SYNC_ARTIST_DISCOGRAPHY":
      if (typeof o.artistId !== "string") throw new Error("SYNC_ARTIST_DISCOGRAPHY requires artistId");
      return { type: "SYNC_ARTIST_DISCOGRAPHY" as const, artistId: o.artistId };
    case "SYNC_ALBUM_TRACKS":
      if (typeof o.albumId !== "string" || typeof o.spotifyAlbumApiId !== "string")
        throw new Error("SYNC_ALBUM_TRACKS requires albumId and spotifyAlbumApiId");
      return { type: "SYNC_ALBUM_TRACKS" as const, albumId: o.albumId, spotifyAlbumApiId: o.spotifyAlbumApiId };
    case "REPAIR_LASTFM_AGGREGATES":
      return {
        type: "REPAIR_LASTFM_AGGREGATES",
        batch: typeof o.batch === "number" ? o.batch : undefined,
      };
    case "UPGRADE_LASTFM_ALBUM_COVERS":
      return {
        type: "UPGRADE_LASTFM_ALBUM_COVERS",
        batch: typeof o.batch === "number" ? o.batch : undefined,
        scan: typeof o.scan === "number" ? o.scan : undefined,
        gapMs: typeof o.gapMs === "number" ? o.gapMs : undefined,
      };
    case "SNAPSHOT_TASTE_MONTHLY":
    case "REFRESH_BLIND_SPOTS":
    case "DRAIN_ENRICH_BACKLOG":
      return { type: t };
    case "ENRICH_ARTIST":
      if (typeof o.artistId !== "string") throw new Error("ENRICH_ARTIST requires artistId");
      return { type: "ENRICH_ARTIST" as const, artistId: o.artistId };
    case "ENRICH_ALBUM":
      if (typeof o.albumId !== "string") throw new Error("ENRICH_ALBUM requires albumId");
      return { type: "ENRICH_ALBUM" as const, albumId: o.albumId };
    case "SPOTIFY_ENRICHMENT_RETRY":
      return {
        type: "SPOTIFY_ENRICHMENT_RETRY" as const,
        batchSongs: typeof o.batchSongs === "number" ? o.batchSongs : undefined,
        batchArtists: typeof o.batchArtists === "number" ? o.batchArtists : undefined,
      };
    case "ARCHIVE_OLD_LOGS":
      return {
        type: "ARCHIVE_OLD_LOGS" as const,
        cutoff_days: typeof o.cutoff_days === "number" ? o.cutoff_days : undefined,
      };
    case "ENRICH_CATALOG_METADATA":
      return {
        type: "ENRICH_CATALOG_METADATA" as const,
        dates: typeof o.dates === "number" ? o.dates : undefined,
        tracks: typeof o.tracks === "number" ? o.tracks : undefined,
      };
    default:
      throw new Error(`Unknown cron job type: ${t}`);
  }
}
