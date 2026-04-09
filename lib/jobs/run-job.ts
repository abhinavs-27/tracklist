import type { BillboardJobMessage, CronJobMessage } from "@/lib/jobs/types";
import {
  runGenerateCommunityBillboard,
  runGenerateUserBillboard,
} from "@/lib/jobs/billboard-handlers";
import * as cron from "@/lib/cron/cron-runners";

const JOB_LOG = "[job]";

export async function runBillboardJob(job: BillboardJobMessage): Promise<void> {
  const t0 = Date.now();
  console.log(JOB_LOG, "start", job);
  try {
    if (job.type === "GENERATE_USER_BILLBOARD") {
      await runGenerateUserBillboard({ userId: job.userId, week: job.week });
    } else {
      await runGenerateCommunityBillboard({
        communityId: job.communityId,
        week: job.week,
      });
    }
    console.log(JOB_LOG, "done", { type: job.type, ms: Date.now() - t0 });
  } catch (e) {
    console.error(JOB_LOG, "failed", {
      job,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export async function runCronJob(job: CronJobMessage): Promise<void> {
  const t0 = Date.now();
  console.log(JOB_LOG, "start", job);
  try {
    switch (job.type) {
      case "REFRESH_STATS":
        await cron.runRefreshStats();
        break;
      case "COMPUTE_COOCCURRENCE":
        await cron.runComputeCooccurrence();
        break;
      case "LASTFM_SYNC":
        await cron.runLastfmSync();
        break;
      case "TASTE_IDENTITY_REFRESH":
        await cron.runTasteIdentityRefresh();
        break;
      case "COMMUNITY_FEATURE_WEEKLY":
        await cron.runCommunityFeatureWeekly(job.limit ?? 80);
        break;
      case "BILLBOARD_WEEKLY_EMAIL":
        await cron.runBillboardWeeklyEmail();
        break;
      case "LISTENING_AGGREGATES":
        await cron.runListeningAggregates();
        break;
      case "REPAIR_LASTFM_AGGREGATES":
        await cron.runRepairLastfmAggregates(job.batch);
        break;
      case "UPGRADE_LASTFM_ALBUM_COVERS":
        await cron.runUpgradeLastfmAlbumCovers({
          batch: job.batch,
          scan: job.scan,
          gapMs: job.gapMs,
        });
        break;
      default:
        throw new Error(`Unknown cron job: ${JSON.stringify(job)}`);
    }
    console.log(JOB_LOG, "done", { type: job.type, ms: Date.now() - t0 });
  } catch (e) {
    console.error(JOB_LOG, "failed", {
      job,
      ms: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
