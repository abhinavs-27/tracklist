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
      return { type: t };
    case "COMMUNITY_FEATURE_WEEKLY":
      return {
        type: "COMMUNITY_FEATURE_WEEKLY",
        limit: typeof o.limit === "number" ? o.limit : undefined,
      };
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
    default:
      throw new Error(`Unknown cron job type: ${t}`);
  }
}
