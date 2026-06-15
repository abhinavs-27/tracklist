import type { BillboardJobMessage, CronJobMessage } from "@/lib/jobs/types";
import {
  runGenerateCommunityBillboard,
  runGenerateUserBillboard,
} from "@/lib/jobs/billboard-handlers";
import * as cron from "@/lib/cron/cron-runners";

const JOB_LOG = "[job]";

const SPOTIFY_JOB_TYPES = new Set([
  "ENRICH_ARTIST",
  "ENRICH_ALBUM",
  "SPOTIFY_ENRICHMENT_RETRY",
  "DRAIN_ENRICH_BACKLOG",
  "SYNC_ARTIST_DISCOGRAPHY",
  "SYNC_ALBUM_TRACKS",
]);

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
    // Single circuit breaker check for all Spotify-dependent jobs.
    // If rate-limited, return cleanly so SQS deletes the message (no retry storm).
    if (SPOTIFY_JOB_TYPES.has(job.type)) {
      const { checkCircuitBreaker } = await import("@/lib/spotify/client");
      try {
        await checkCircuitBreaker();
      } catch {
        console.warn(JOB_LOG, `${job.type} skipped — Spotify circuit breaker active`);
        return;
      }
    }

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
      case "REFRESH_COMMUNITY_MEMBER_STATS": {
        const { computeAllCommunitiesWeekly } = await import(
          "@/lib/community/compute-community-weekly"
        );
        await computeAllCommunitiesWeekly();
        break;
      }
      case "REPAIR_LASTFM_AGGREGATES":
        await cron.runRepairLastfmAggregates(job.batch);
        break;
      case "POST_IMPORT_PIPELINE": {
        const { runPostImportPipelineForUser } = await import("@/lib/jobs/post-import-pipeline");
        await runPostImportPipelineForUser(job.userId, { mode: "inline" });
        break;
      }
      case "UPGRADE_LASTFM_ALBUM_COVERS":
        await cron.runUpgradeLastfmAlbumCovers({
          batch: job.batch,
          scan: job.scan,
          gapMs: job.gapMs,
        });
        break;
      case "SYNC_ARTIST_DISCOGRAPHY": {
        const { syncArtistDiscographyForCanonicalArtist } = await import(
          "@/lib/spotify-cache"
        );
        await syncArtistDiscographyForCanonicalArtist(job.artistId);
        break;
      }
      case "SYNC_ALBUM_TRACKS": {
        const { refreshAlbumFromSpotify } = await import("@/lib/spotify-cache");
        const supabase = (await import("@/lib/supabase-admin")).createSupabaseAdminClient();
        await refreshAlbumFromSpotify(supabase, job.spotifyAlbumApiId);
        break;
      }
      case "SNAPSHOT_TASTE_MONTHLY":
        await cron.runSnapshotTasteMonthly();
        break;
      case "REFRESH_BLIND_SPOTS":
        await cron.runRefreshBlindSpots();
        break;
      case "DRAIN_ENRICH_BACKLOG":
        await cron.runDrainEnrichBacklog();
        break;
      case "SPOTIFY_ENRICHMENT_RETRY":
        await cron.runSpotifyEnrichmentRetry(job.batchSongs, job.batchArtists);
        break;
      case "ARCHIVE_OLD_LOGS":
        await cron.runArchiveOldLogs(job.cutoff_days);
        break;
      case "ENRICH_ARTIST": {
        const { processSpotifyEnrichJob } = await import("@/lib/jobs/spotifyQueue");
        await processSpotifyEnrichJob({ name: "enrich_artist", artistId: job.artistId });
        break;
      }
      case "ENRICH_ALBUM": {
        const { processSpotifyEnrichJob } = await import("@/lib/jobs/spotifyQueue");
        await processSpotifyEnrichJob({ name: "enrich_album", albumId: job.albumId });
        break;
      }
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
