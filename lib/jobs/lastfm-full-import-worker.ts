import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { backfillLastfmScrobblesSince } from "@/lib/lastfm/backfill-scrobbles-since";
import type { LastfmFullImportJobData } from "@/lib/jobs/lastfmQueue";

const LOG = "[lastfm-full-import-worker]";

async function writeProgress(
  userId: string,
  status: "running" | "done" | "failed",
  progress: {
    pagesDone?: number;
    pagesTotal?: number | null;
    logsAdded?: number;
    startedAt?: string;
    completedAt?: string;
    error?: string;
  },
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { data: row } = await supabase
    .from("users")
    .select("lastfm_import_progress")
    .eq("id", userId)
    .maybeSingle();

  const existing = (row?.lastfm_import_progress as Record<string, unknown> | null) ?? {};
  const merged = { ...existing, ...progress };

  await supabase
    .from("users")
    .update({ lastfm_import_status: status, lastfm_import_progress: merged })
    .eq("id", userId);
}

export async function processLastfmFullImportJob(job: LastfmFullImportJobData): Promise<void> {
  const { userId, lastfmUsername, fromIso } = job;
  const startedAt = new Date().toISOString();

  console.log(LOG, "start", { userId, lastfmUsername });

  await writeProgress(userId, "running", { startedAt, pagesDone: 0, logsAdded: 0, pagesTotal: null });

  const supabase = createSupabaseAdminClient();

  try {
    const result = await backfillLastfmScrobblesSince(
      supabase,
      userId,
      lastfmUsername,
      fromIso,
      {
        pageDelayMs: 450,
        limit: 200,
        maxPagesPerUser: 1000,
        onProgress: async ({ pagesDone, pagesTotal, logsAdded }) => {
          await writeProgress(userId, "running", { pagesDone, pagesTotal, logsAdded });
        },
      },
    );

    if (result.fetchFailed) {
      await writeProgress(userId, "failed", {
        error: result.fetchError ?? "Last.fm fetch failed",
        completedAt: new Date().toISOString(),
      });
      console.warn(LOG, "fetch failed", { userId, error: result.fetchError });
      return;
    }

    if (result.hasMore) {
      console.log(LOG, "hasMore — re-enqueueing", { userId });
      const { enqueueLastfmFullImport } = await import("@/lib/jobs/lastfmQueue");
      await enqueueLastfmFullImport({ userId, lastfmUsername, fromIso });
      return;
    }

    await writeProgress(userId, "done", {
      pagesDone: result.pagesFetched,
      logsAdded: result.imported,
      completedAt: new Date().toISOString(),
    });

    console.log(LOG, "done", { userId, imported: result.imported, pages: result.pagesFetched });

    // Kick off the stats pipeline. Fire-and-forget — a pipeline failure must not
    // fail the import job (BullMQ would retry the whole import).
    if (result.imported > 0) {
      const { runPostImportPipelineForUser } = await import("@/lib/jobs/post-import-pipeline");
      void runPostImportPipelineForUser(userId).catch((e) => {
        console.error(LOG, "post-import pipeline failed (non-fatal)", {
          userId,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(LOG, "exception", { userId, error: msg });
    await writeProgress(userId, "failed", {
      error: msg,
      completedAt: new Date().toISOString(),
    });
    throw e;
  }
}
