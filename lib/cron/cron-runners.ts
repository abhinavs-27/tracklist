import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { startJobRun } from "@/lib/jobs/job-logger";
import { snapshotAllUsersLastMonth } from "@/lib/cron/snapshot-taste";
import {
  hydrateStatsCatalogFromSpotify,
  type HydrateStatsCatalogResult,
} from "@/lib/cron/hydrate-stats-catalog";
import { populatePrecomputedCaches } from "@/lib/cron/populate-precomputed-caches";
import { syncLastfmScrobblesForUser } from "@/lib/lastfm/sync-user-scrobbles";
import { refreshTasteIdentityCacheForUser } from "@/lib/taste/taste-identity";
import { computeAllCommunitiesWeekly } from "@/lib/community/compute-community-weekly";
import { sendBillboardWeeklyDigestEmail } from "@/lib/email/send-billboard-weekly-email";
import { updateListeningAggregates } from "@/lib/analytics/updateListeningAggregates";
import {
  repairMissingArtistAggregates,
  repairOrphanedArtistAggregates,
} from "@/lib/analytics/repair-artist-aggregates";
import { runUpgradeLastfmAlbumCovers as upgradeLastfmAlbumCoversCatalog } from "@/lib/catalog/upgrade-lastfm-album-covers";

const LOG = "[cron-runners]";

const MAX_LASTFM_USERS_PER_RUN = 50;
const MAX_TASTE_IDENTITY_USERS_PER_RUN = 500;

async function resolveTasteIdentityCronUserIds(): Promise<string[]> {
  const admin = createSupabaseAdminClient();
  const seen = new Set<string>();
  const out: string[] = [];

  const { data: needRows, error: needErr } = await admin.rpc(
    "user_ids_without_taste_identity_cache",
    { p_limit: MAX_TASTE_IDENTITY_USERS_PER_RUN },
  );

  if (needErr) {
    console.warn(
      LOG,
      "user_ids_without_taste_identity_cache RPC failed",
      needErr,
    );
  } else {
    for (const row of needRows ?? []) {
      const id = (row as { user_id: string }).user_id;
      if (id && !seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  }

  if (out.length < MAX_TASTE_IDENTITY_USERS_PER_RUN) {
    const { data: staleRows, error: staleErr } = await admin
      .from("taste_identity_cache")
      .select("user_id")
      .order("updated_at", { ascending: true, nullsFirst: true })
      .limit(MAX_TASTE_IDENTITY_USERS_PER_RUN);

    if (staleErr) {
      console.error(LOG, "taste_identity_cache query failed", staleErr);
    } else {
      for (const r of staleRows ?? []) {
        const id = r.user_id as string;
        if (id && !seen.has(id)) {
          seen.add(id);
          out.push(id);
        }
        if (out.length >= MAX_TASTE_IDENTITY_USERS_PER_RUN) break;
      }
    }
  }

  return out.slice(0, MAX_TASTE_IDENTITY_USERS_PER_RUN);
}

export async function runRefreshStats(): Promise<{
  ok: true;
  totalMs: number;
  precomputedCaches: Awaited<
    ReturnType<typeof populatePrecomputedCaches>
  > | null;
  catalogHydration: HydrateStatsCatalogResult | null;
  catalogHydrationError: string | null;
}> {
  const run = await startJobRun("refresh_stats");
  try {
    const runStarted = Date.now();
    console.log(LOG, "refresh-stats start", {
      SPOTIFY_REFRESH_DISABLED: process.env.SPOTIFY_REFRESH_DISABLED === "true",
    });

    const supabase = createSupabaseAdminClient();

    let t = Date.now();
    const { error: statsError } = await supabase.rpc("refresh_entity_stats");
    console.log(LOG, "refresh_entity_stats", {
      ok: !statsError,
      ms: Date.now() - t,
      error: statsError?.message,
    });
    if (statsError) {
      throw new Error(statsError.message);
    }

    t = Date.now();
    const { error: favError } = await supabase.rpc(
      "sync_favorite_counts_from_user_favorite_albums",
    );
    console.log(LOG, "sync_favorite_counts_from_user_favorite_albums", {
      ok: !favError,
      ms: Date.now() - t,
      error: favError?.message,
    });
    if (favError) {
      throw new Error(favError.message);
    }

    t = Date.now();
    const { error: discoverError } = await supabase.rpc("refresh_discover_mvs");
    console.log(LOG, "refresh_discover_mvs", {
      ok: !discoverError,
      ms: Date.now() - t,
      error: discoverError?.message ?? null,
    });
    if (discoverError) {
      console.warn(
        LOG,
        "refresh_discover_mvs skipped (non-fatal if migration missing):",
        discoverError.message,
      );
    }

    let precomputedCaches: Awaited<
      ReturnType<typeof populatePrecomputedCaches>
    > | null = null;
    try {
      precomputedCaches = await populatePrecomputedCaches();
      console.log(LOG, "populate_precomputed_caches", {
        leaderboardRows: precomputedCaches.leaderboardRows,
        trending: precomputedCaches.trending,
        communityRows: precomputedCaches.communityRows,
        errorCount: precomputedCaches.errors.length,
      });
    } catch (e) {
      console.warn(
        LOG,
        "populate_precomputed_caches failed (non-fatal)",
        e instanceof Error ? e.message : e,
      );
    }

    let catalogHydration: HydrateStatsCatalogResult | null = null;
    let catalogHydrationError: string | null = null;
    try {
      const maxAlbums = parseInt(
        process.env.STATS_HYDRATE_MAX_ALBUMS ?? "500",
        10,
      );
      const maxTracks = parseInt(
        process.env.STATS_HYDRATE_MAX_TRACKS ?? "200",
        10,
      );
      t = Date.now();
      catalogHydration = await hydrateStatsCatalogFromSpotify(supabase, {
        maxAlbums: Number.isFinite(maxAlbums) ? maxAlbums : 500,
        maxTracks: Number.isFinite(maxTracks) ? maxTracks : 200,
      });
      console.log(LOG, "hydrate_stats_catalog_summary", {
        ms: Date.now() - t,
        hydrationMode: catalogHydration.hydrationMode,
      });
    } catch (e) {
      catalogHydrationError =
        e instanceof Error ? e.message : String(e);
      console.error(LOG, "hydrate_stats_catalog_failed", catalogHydrationError);
    }

    const totalMs = Date.now() - runStarted;
    console.log(LOG, "refresh-stats done", { totalMs });
    void run.finish({ status: "ok" });
    return {
      ok: true,
      totalMs,
      precomputedCaches,
      catalogHydration,
      catalogHydrationError,
    };
  } catch (e) {
    void run.finish({ status: "error" });
    throw e;
  }
}

export async function runComputeCooccurrence(): Promise<{
  ok: true;
  songs: { pairs_written: number };
  albums: { pairs_written: number };
}> {
  const run = await startJobRun("compute_cooccurrence");
  try {
    const admin = createSupabaseAdminClient();

    const { data: songData, error: songErr } = await admin.rpc(
      "compute_song_cooccurrence_in_db",
    );
    if (songErr) throw new Error(songErr.message);

    const { data: albumData, error: albumErr } = await admin.rpc(
      "compute_album_cooccurrence_in_db",
    );
    if (albumErr) throw new Error(albumErr.message);

    const songs = {
      pairs_written:
        (songData?.[0] as { pairs_written: number } | undefined)?.pairs_written ?? 0,
    };
    const albums = {
      pairs_written:
        (albumData?.[0] as { pairs_written: number } | undefined)?.pairs_written ?? 0,
    };

    console.log(LOG, "co-occurrence done", { songs, albums });
    void run.finish({ status: "ok", items_ok: songs.pairs_written + albums.pairs_written });
    return { ok: true, songs, albums };
  } catch (e) {
    void run.finish({ status: "error" });
    throw e;
  }
}

export async function runLastfmSync(): Promise<{
  ok: true;
  processed: number;
  inserted: number;
  failures: number;
}> {
  const run = await startJobRun("lastfm_sync");
  const supabase = createSupabaseAdminClient();

  const { data: rawUsers, error } = await supabase
    .from("users")
    .select("id, lastfm_username")
    .not("lastfm_username", "is", null)
    .neq("lastfm_username", "")
    .order("lastfm_last_synced_at", { ascending: true, nullsFirst: true })
    .limit(MAX_LASTFM_USERS_PER_RUN);

  if (error) {
    void run.finish({ status: "error" });
    throw new Error(error.message);
  }

  const users = (rawUsers ?? []).filter((u) => u.lastfm_username?.trim());

  let processed = 0;
  let totalInserted = 0;
  let failures = 0;

  for (const u of users) {
    const username = u.lastfm_username!.trim();
    processed += 1;
    try {
      const result = await syncLastfmScrobblesForUser(supabase, u.id, username);
      if (result.fetchFailed) {
        failures += 1;
        continue;
      }
      totalInserted += result.imported;
    } catch {
      failures += 1;
    }
  }

  void run.finish({
    status: failures === 0 ? "ok" : "error",
    items_ok: totalInserted,
    items_failed: failures,
  });
  return { ok: true, processed, inserted: totalInserted, failures };
}

export async function runTasteIdentityRefresh(): Promise<{
  ok: true;
  attempted: number;
  processed: number;
  failures: number;
}> {
  const run = await startJobRun("taste_identity_refresh");
  try {
    const userIds = await resolveTasteIdentityCronUserIds();
    let processed = 0;
    let failures = 0;

    const CONCURRENCY = 10;
    for (let i = 0; i < userIds.length; i += CONCURRENCY) {
      const chunk = userIds.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        chunk.map((userId) => refreshTasteIdentityCacheForUser(userId)),
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          processed += 1;
        } else {
          console.error(LOG, "taste-identity refresh failed", r.reason);
          failures += 1;
        }
      }
    }

    void run.finish({ status: "ok", items_ok: processed, items_failed: failures });
    return {
      ok: true,
      attempted: userIds.length,
      processed,
      failures,
    };
  } catch (e) {
    void run.finish({ status: "error" });
    throw e;
  }
}

export async function runCommunityFeatureWeekly(
  limit = 80,
): Promise<{ ok: true; processed: number; failures: number }> {
  const capped = Math.min(200, Math.max(1, limit));
  const { processed, failures } = await computeAllCommunitiesWeekly(capped);
  return { ok: true, processed, failures };
}

export async function runBillboardWeeklyEmail(): Promise<{
  ok: true;
  week_start: string;
  candidates: number;
  sent: number;
  skippedAlready: number;
  skippedNoEmail: number;
  sendFailed: number;
  firstSendError: string | null;
  note: string | null;
  skipped?: boolean;
  reason?: string;
}> {
  const run = await startJobRun("billboard_weekly_email");
  try {
    const admin = createSupabaseAdminClient();

    const { data: latestRow, error: latestErr } = await admin
      .from("user_weekly_charts")
      .select("week_start")
      .eq("chart_type", "tracks")
      .order("week_start", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestErr || !latestRow?.week_start) {
      void run.finish({ status: "skipped" });
      return {
        ok: true,
        skipped: true,
        reason: "no_chart_week",
        week_start: "",
        candidates: 0,
        sent: 0,
        skippedAlready: 0,
        skippedNoEmail: 0,
        sendFailed: 0,
        firstSendError: null,
        note:
          "No rows in user_weekly_charts (tracks) — weekly chart jobs must run first.",
      };
    }

    const weekStart = latestRow.week_start as string;

    const { data: chartRows, error: chartErr } = await admin
      .from("user_weekly_charts")
      .select("user_id")
      .eq("chart_type", "tracks")
      .eq("week_start", weekStart);

    if (chartErr) {
      throw new Error(chartErr.message);
    }

    const userIds = [
      ...new Set(
        (chartRows ?? []).map((r: { user_id: string }) => r.user_id),
      ),
    ];

    let sent = 0;
    let skippedAlready = 0;
    let skippedNoEmail = 0;
    let sendFailed = 0;
    let firstSendError: string | undefined;

    // Batch-fetch all candidate users in one query (was N individual SELECTs)
    const { data: userRows, error: usersErr } = await admin
      .from("users")
      .select("id, email, billboard_weekly_email_last_week")
      .in("id", userIds);

    if (usersErr) throw new Error(usersErr.message);

    const sentUserIds: string[] = [];

    for (const userRow of userRows ?? []) {
      const { id: userId, email, billboard_weekly_email_last_week } = userRow as {
        id: string;
        email: string | null;
        billboard_weekly_email_last_week: string | null;
      };

      if (!email) {
        skippedNoEmail += 1;
        continue;
      }

      if (billboard_weekly_email_last_week === weekStart) {
        skippedAlready += 1;
        continue;
      }

      const sendResult = await sendBillboardWeeklyDigestEmail({
        userId,
        email,
        weekStart,
      });

      if (sendResult.ok) {
        sentUserIds.push(userId);
        sent += 1;
      } else {
        sendFailed += 1;
        if (!firstSendError) firstSendError = sendResult.reason;
      }
    }

    // Batch-update all successful sends in one query (was N individual UPDATEs)
    if (sentUserIds.length > 0) {
      const { error: upErr } = await admin
        .from("users")
        .update({ billboard_weekly_email_last_week: weekStart })
        .in("id", sentUserIds);
      if (upErr) {
        console.error(LOG, "billboard-weekly-email batch update", upErr);
      }
    }

    let note: string | null = null;
    if (userIds.length === 0) {
      note =
        "No users have a tracks chart row for this week_start (candidates is 0).";
    } else if (sent === 0) {
      const withEmail = userIds.length - skippedNoEmail;
      if (withEmail > 0 && skippedAlready === withEmail) {
        note =
          "Dedupe only: every user with an email already has users.billboard_weekly_email_last_week equal to this week.";
      } else if (sendFailed > 0) {
        note =
          "At least one send failed (Resend/chart/env). See firstSendError and logs.";
      } else if (skippedNoEmail === userIds.length) {
        note = "No candidate user had an email address.";
      } else {
        note =
          "sent=0 — see skippedAlready, skippedNoEmail, sendFailed in this JSON.";
      }
    }

    void run.finish({ status: sent > 0 ? "ok" : "skipped", items_ok: sent, items_failed: sendFailed });
    return {
      ok: true,
      week_start: weekStart,
      candidates: userIds.length,
      sent,
      skippedAlready,
      skippedNoEmail,
      sendFailed,
      firstSendError: firstSendError ?? null,
      note,
    };
  } catch (e) {
    void run.finish({ status: "error" });
    throw e;
  }
}

export async function runListeningAggregates(): Promise<
  Awaited<ReturnType<typeof updateListeningAggregates>> & { ok: true; repairInserted: number }
> {
  const run = await startJobRun("listening_aggregates");
  try {
    const result = await updateListeningAggregates();

    // After each batch, repair any album→artist attribution gaps created when
    // logs were processed before Spotify enrichment completed (artist_id was null).
    const repair = result.processed > 0
      ? await repairMissingArtistAggregates()
      : { inserted: 0, errors: 0 };

    if (repair.inserted > 0) {
      console.log("[cron] repair_missing_artist_aggregates inserted", repair.inserted);
    }

    void run.finish({
      status: result.processed > 0 ? "ok" : "skipped",
      items_ok: result.processed,
      items_failed: result.errors + repair.errors,
    });
    return { ok: true, ...result, repairInserted: repair.inserted };
  } catch (e) {
    void run.finish({ status: "error" });
    throw e;
  }
}

export async function runRepairArtistAggregates(): Promise<{
  ok: true;
  missingInserted: number;
  orphanedMerged: number;
  errors: number;
}> {
  const [missing, orphaned] = await Promise.all([
    repairMissingArtistAggregates({ limit: 100000 }),
    repairOrphanedArtistAggregates(),
  ]);
  return {
    ok: true,
    missingInserted: missing.inserted,
    orphanedMerged: orphaned.merged,
    errors: missing.errors + orphaned.errors,
  };
}

export async function runRepairLastfmAggregates(_batch = 500): Promise<{
  ok: true;
  missingInserted: number;
  orphanedMerged: number;
  errors: number;
}> {
  // get_logs_for_lfm_aggregate_repair (migration 088) was stubbed to WHERE FALSE
  // in migration 102 and never re-implemented. The actual repair is handled by
  // repair_missing_artist_aggregates: fills artist rows inferred from album rows
  // for logs processed before Spotify enrichment set tracks.artist_id.
  const [missing, orphaned] = await Promise.all([
    repairMissingArtistAggregates({ limit: 100000 }),
    repairOrphanedArtistAggregates(),
  ]);
  return {
    ok: true,
    missingInserted: missing.inserted,
    orphanedMerged: orphaned.merged,
    errors: missing.errors + orphaned.errors,
  };
}

export async function runUpgradeLastfmAlbumCovers(options?: {
  batch?: number;
  scan?: number;
  gapMs?: number;
}): Promise<
  Awaited<ReturnType<typeof upgradeLastfmAlbumCoversCatalog>> & { ok: true }
> {
  const batch = Math.min(
    40,
    Math.max(1, options?.batch ?? 20),
  );
  const scan = Math.min(
    5000,
    Math.max(100, options?.scan ?? 600),
  );
  const gapMs =
    options?.gapMs == null
      ? undefined
      : Math.min(5000, Math.max(0, options.gapMs));

  const result = await upgradeLastfmAlbumCoversCatalog({
    maxBatch: batch,
    scanLimit: scan,
    gapMs,
  });
  return { ok: true, ...result };
}


export async function runSnapshotTasteMonthly() {
  return snapshotAllUsersLastMonth();
}

export async function runRefreshBlindSpots(): Promise<{
  ok: true;
  processed: number;
  skipped: number;
  errors: number;
}> {
  const run = await startJobRun("blind_spots");
  try {
    const { refreshBlindSpots } = await import("@/lib/profile/taste-blind-spots");
    const admin = createSupabaseAdminClient();

    // Users whose blind spots are stale (computed > 7 days ago)
    const { data: staleRows, error: staleErr } = await admin
      .from("user_blind_spots")
      .select("user_id")
      .lt("computed_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    if (staleErr) throw new Error(`[blind-spots] stale query: ${staleErr.message}`);

    // Users with any listening history but no blind spots row yet
    const { data: newRows, error: newErr } = await admin
      .from("user_listening_aggregates")
      .select("user_id")
      .eq("entity_type", "track")
      .not("year", "is", null)
      .limit(500);

    if (newErr) throw new Error(`[blind-spots] new-users query: ${newErr.message}`);

    const existingSet = new Set((staleRows ?? []).map((r) => r.user_id as string));
    const newUserIds = (newRows ?? []).map((r) => r.user_id as string);
    const { data: conflictingBlindSpots } = await admin
      .from("user_blind_spots")
      .select("user_id")
      .in("user_id", newUserIds);
    const hasBlindSpot = new Set((conflictingBlindSpots ?? []).map((r) => r.user_id as string));

    for (const r of newRows ?? []) {
      const uid = r.user_id as string;
      if (!hasBlindSpot.has(uid)) existingSet.add(uid);
    }

    const userIds = [...existingSet];

    // Bottleneck in the Spotify client already paces the API calls — no extra delay needed.
    let processed = 0, skipped = 0, errors = 0;

    for (const userId of userIds) {
      try {
        const result = await refreshBlindSpots(userId);
        if (result.hasData) processed++;
        else skipped++;
      } catch (e) {
        errors++;
        console.error("[blind-spots] failed for", userId, e instanceof Error ? e.message : String(e));
      }
    }

    console.log(`[blind-spots] done — processed:${processed} skipped:${skipped} errors:${errors}`);
    void run.finish({ status: "ok", items_ok: processed, items_failed: errors });
    return { ok: true, processed, skipped, errors };
  } catch (e) {
    void run.finish({ status: "error" });
    throw e;
  }
}

export async function runDrainEnrichBacklog(): Promise<{
  ok: true;
  drained: number;
  errors: number;
  skipped?: string;
}> {
  // Don't drain while Spotify is rate-limited — flooding SQS with jobs that
  // will all immediately fail makes recovery slower, not faster.
  const { checkCircuitBreaker } = await import("@/lib/spotify/client");
  try {
    await checkCircuitBreaker();
  } catch {
    console.warn("[drain-enrich] Spotify circuit breaker active — skipping drain");
    return { ok: true, drained: 0, errors: 0, skipped: "spotify-degraded" };
  }

  const { getSpotifyEnrichQueue } = await import("@/lib/jobs/spotifyQueue");
  const { sendEnrichJobMessage } = await import("@/lib/jobs/enqueue-enrich-message");

  const queue = getSpotifyEnrichQueue();
  if (!queue) {
    console.log("[drain-enrich] no BullMQ queue — nothing to drain");
    return { ok: true, drained: 0, errors: 0 };
  }

  const [waiting, delayed] = await Promise.all([
    queue.getWaiting(0, 1000),
    queue.getDelayed(0, 1000),
  ]);

  const jobs = [...waiting, ...delayed];
  console.log(`[drain-enrich] ${jobs.length} jobs to drain to SQS`);

  let drained = 0;
  let errors = 0;

  for (const j of jobs) {
    try {
      const data = j.data as { name: string; artistId?: string; albumId?: string };
      if (data.name === "enrich_artist" && data.artistId) {
        await sendEnrichJobMessage({ type: "ENRICH_ARTIST", artistId: data.artistId });
      } else if (data.name === "enrich_album" && data.albumId) {
        await sendEnrichJobMessage({ type: "ENRICH_ALBUM", albumId: data.albumId });
      } else {
        // Unknown job type — leave it for the BullMQ worker
        continue;
      }
      await j.remove();
      drained++;
    } catch (e) {
      errors++;
      console.error("[drain-enrich] failed", j.id, e instanceof Error ? e.message : String(e));
    }
  }

  console.log(`[drain-enrich] done — drained:${drained} errors:${errors}`);
  return { ok: true, drained, errors };
}

export async function runArchiveOldLogs(
  cutoffDays = 180,
): Promise<{ ok: true; archived: number }> {
  const capped = Math.min(365, Math.max(30, cutoffDays));
  const run = await startJobRun("archive_old_logs", { cutoff_days: capped });
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("archive_old_logs", {
      p_cutoff_days: capped,
      p_batch_size:  5000,
    });
    if (error) throw new Error(error.message);
    const archived =
      (data?.[0] as { archived: number } | undefined)?.archived ?? 0;
    console.log(LOG, "archive_old_logs done", { archived });
    void run.finish({ status: archived > 0 ? "ok" : "skipped", items_ok: archived });
    return { ok: true, archived };
  } catch (e) {
    void run.finish({ status: "error" });
    throw e;
  }
}

export async function runSpotifyEnrichmentRetry(
  batchSongs = 200,
  batchArtists = 100,
): Promise<{ ok: true; songs: number; artists: number; queued: number }> {
  const run = await startJobRun("spotify_enrichment_retry", {
    batch_songs: batchSongs,
    batch_artists: batchArtists,
  });
  try {
    const {
      enqueueSpotifyEnrich,
      getSpotifyEnrichQueue,
      getSpotifyResolveStaggerMs,
      processSpotifyEnrichJob,
    } = await import("@/lib/jobs/spotifyQueue");
    const { lfmArtistId, lfmSongId } = await import("@/lib/lastfm/lfm-ids");
    const { syncListensSpotifyTrackIdsFromSongs } = await import(
      "@/lib/lastfm/sync-listens-spotify-from-songs"
    );

    const admin = createSupabaseAdminClient();

    await syncListensSpotifyTrackIdsFromSongs(admin, { limit: 800 });

    // Clear flag for rows that can never be enriched — no LFM identity to search by.
    // These accumulate silently and inflate the pending count.
    await Promise.all([
      admin
        .from("tracks")
        .update({ needs_spotify_enrichment: false })
        .eq("needs_spotify_enrichment", true)
        .is("lastfm_name", null),
      admin
        .from("artists")
        .update({ needs_spotify_enrichment: false })
        .eq("needs_spotify_enrichment", true)
        .is("lastfm_name", null),
    ]);

    const cappedSongs = Math.min(200, Math.max(1, batchSongs));
    const cappedArtists = Math.min(100, Math.max(1, batchArtists));

    const [{ data: songs }, { data: artists }] = await Promise.all([
      admin
        .from("tracks")
        .select("id, lastfm_name, lastfm_artist_name")
        .eq("needs_spotify_enrichment", true)
        .not("lastfm_name", "is", null)
        .not("lastfm_artist_name", "is", null)
        .order("updated_at", { ascending: true })
        .limit(cappedSongs),
      admin
        .from("artists")
        .select("id, lastfm_name")
        .eq("needs_spotify_enrichment", true)
        .not("lastfm_name", "is", null)
        .order("updated_at", { ascending: true })
        .limit(cappedArtists),
    ]);

    const jobList: Awaited<ReturnType<typeof getSpotifyEnrichQueue>> extends null
      ? never
      : Parameters<typeof enqueueSpotifyEnrich>[0][] = [];

    type JobData = Parameters<typeof enqueueSpotifyEnrich>[0];
    const jobs: JobData[] = [];

    for (const s of songs ?? []) {
      if (!s.lastfm_name || !s.lastfm_artist_name) continue;
      jobs.push({
        name: "resolve_track_spotify",
        lfmSongId: lfmSongId(s.lastfm_artist_name, s.lastfm_name),
        artistName: s.lastfm_artist_name,
        trackName: s.lastfm_name,
        albumName: null,
      } as JobData);
    }
    for (const a of artists ?? []) {
      if (!a.lastfm_name) continue;
      jobs.push({
        name: "resolve_artist_spotify",
        lfmArtistId: lfmArtistId(a.lastfm_name),
        artistName: a.lastfm_name,
      } as JobData);
    }

    const queue = getSpotifyEnrichQueue();
    if (queue) {
      for (let i = 0; i < jobs.length; i++) {
        await enqueueSpotifyEnrich(jobs[i]!, { staggerIndex: i });
      }
    } else {
      const staggerMs = getSpotifyResolveStaggerMs();
      for (let i = 0; i < jobs.length; i++) {
        try { await processSpotifyEnrichJob(jobs[i]!); } catch {}
        if (staggerMs > 0 && i < jobs.length - 1) {
          await new Promise((r) => setTimeout(r, staggerMs));
        }
      }
    }

    console.log(LOG, "spotify_enrichment_retry done", {
      songs: (songs ?? []).length,
      artists: (artists ?? []).length,
      queued: jobs.length,
    });
    void run.finish({ status: jobs.length > 0 ? "ok" : "skipped", items_ok: jobs.length });
    return { ok: true, songs: (songs ?? []).length, artists: (artists ?? []).length, queued: jobs.length };
  } catch (e) {
    void run.finish({ status: "error" });
    throw e;
  }
}
