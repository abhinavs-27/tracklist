/**
 * SQS message bodies for the billboard queue (`billboard-jobs`) and cron queue (`tracklist-cron-jobs`).
 * `week` is the chart week start (Sunday 00:00 UTC), ISO 8601 string.
 */

export type BillboardJobMessage =
  | {
      type: "GENERATE_USER_BILLBOARD";
      userId: string;
      week: string;
    }
  | {
      type: "GENERATE_COMMUNITY_BILLBOARD";
      communityId: string;
      week: string;
    };

export type CronJobMessage =
  | { type: "REFRESH_STATS" }
  | { type: "COMPUTE_COOCCURRENCE" }
  | { type: "LASTFM_SYNC" }
  | { type: "TASTE_IDENTITY_REFRESH" }
  | { type: "COMMUNITY_FEATURE_WEEKLY"; limit?: number }
  | { type: "BILLBOARD_WEEKLY_EMAIL" }
  | { type: "LISTENING_AGGREGATES" }
  | { type: "REPAIR_LASTFM_AGGREGATES"; batch?: number }
  | { type: "UPGRADE_LASTFM_ALBUM_COVERS"; batch?: number; scan?: number; gapMs?: number };

export type JobMessage = BillboardJobMessage | CronJobMessage;
