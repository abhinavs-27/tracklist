import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  hydrateStatsCatalogFromSpotify,
  type HydrateStatsCatalogResult,
} from "@/lib/cron/hydrate-stats-catalog";
import { populatePrecomputedCaches } from "@/lib/cron/populate-precomputed-caches";
import {
  computeSongCooccurrence,
  computeAlbumCooccurrence,
} from "@/lib/discovery/computeCooccurrence";
import { syncLastfmScrobblesForUser } from "@/lib/lastfm/sync-user-scrobbles";
import { refreshTasteIdentityCacheForUser } from "@/lib/taste/taste-identity";
import { computeAllCommunitiesWeekly } from "@/lib/community/compute-community-weekly";
import { sendBillboardWeeklyDigestEmail } from "@/lib/email/send-billboard-weekly-email";
import { updateListeningAggregates } from "@/lib/analytics/updateListeningAggregates";
import { repairLastfmListeningAggregates } from "@/lib/analytics/repairLastfmAggregates";
import { runUpgradeLastfmAlbumCovers as upgradeLastfmAlbumCoversCatalog } from "@/lib/catalog/upgrade-lastfm-album-covers";

const LOG = "[cron-runners]";

const MAX_LASTFM_USERS_PER_RUN = 50;
const MAX_TASTE_IDENTITY_USERS_PER_RUN = 35;

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
  return {
    ok: true,
    totalMs,
    precomputedCaches,
    catalogHydration,
    catalogHydrationError,
  };
}

export async function runComputeCooccurrence(): Promise<{
  ok: true;
  songs: Awaited<ReturnType<typeof computeSongCooccurrence>>;
  albums: Awaited<ReturnType<typeof computeAlbumCooccurrence>>;
}> {
  const songResult = await computeSongCooccurrence();
  const albumResult = await computeAlbumCooccurrence();
  return { ok: true, songs: songResult, albums: albumResult };
}

export async function runLastfmSync(): Promise<{
  ok: true;
  processed: number;
  inserted: number;
  failures: number;
}> {
  const supabase = createSupabaseAdminClient();

  const { data: rawUsers, error } = await supabase
    .from("users")
    .select("id, lastfm_username")
    .not("lastfm_username", "is", null)
    .neq("lastfm_username", "")
    .order("lastfm_last_synced_at", { ascending: true, nullsFirst: true })
    .limit(MAX_LASTFM_USERS_PER_RUN);

  if (error) {
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

  return { ok: true, processed, inserted: totalInserted, failures };
}

export async function runTasteIdentityRefresh(): Promise<{
  ok: true;
  attempted: number;
  processed: number;
  failures: number;
}> {
  const userIds = await resolveTasteIdentityCronUserIds();
  let processed = 0;
  let failures = 0;

  for (const userId of userIds) {
    try {
      await refreshTasteIdentityCacheForUser(userId);
      processed += 1;
    } catch (e) {
      console.error(LOG, "taste-identity refresh failed", userId, e);
      failures += 1;
    }
  }

  return {
    ok: true,
    attempted: userIds.length,
    processed,
    failures,
  };
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
  const admin = createSupabaseAdminClient();

  const { data: latestRow, error: latestErr } = await admin
    .from("user_weekly_charts")
    .select("week_start")
    .eq("chart_type", "tracks")
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestErr || !latestRow?.week_start) {
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

  for (const userId of userIds) {
    const { data: userRow, error: userErr } = await admin
      .from("users")
      .select("email, billboard_weekly_email_last_week")
      .eq("id", userId)
      .maybeSingle();

    if (userErr || !userRow?.email) {
      skippedNoEmail += 1;
      continue;
    }

    if (userRow.billboard_weekly_email_last_week === weekStart) {
      skippedAlready += 1;
      continue;
    }

    const sendResult = await sendBillboardWeeklyDigestEmail({
      userId,
      email: userRow.email,
      weekStart,
    });

    if (sendResult.ok) {
      const { error: upErr } = await admin
        .from("users")
        .update({ billboard_weekly_email_last_week: weekStart })
        .eq("id", userId);
      if (upErr) {
        console.error(LOG, "billboard-weekly-email update", upErr);
      } else {
        sent += 1;
      }
    } else {
      sendFailed += 1;
      if (!firstSendError) firstSendError = sendResult.reason;
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
}

export async function runListeningAggregates(): Promise<
  Awaited<ReturnType<typeof updateListeningAggregates>> & { ok: true }
> {
  const result = await updateListeningAggregates();
  return { ok: true, ...result };
}

export async function runRepairLastfmAggregates(batch = 500): Promise<
  Awaited<ReturnType<typeof repairLastfmListeningAggregates>> & { ok: true }
> {
  const capped = Math.min(2000, Math.max(50, batch));
  const result = await repairLastfmListeningAggregates({ batchSize: capped });
  return { ok: true, ...result };
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
