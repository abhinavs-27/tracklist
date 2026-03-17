import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { ingestRecentPlaysForUser } from "@/lib/logs-ingest";
import { apiUnauthorized, apiError, apiOk } from "@/lib/api-response";
import { isProd } from "@/lib/env";

const BATCH_SIZE = 50;
const MAX_USERS_PER_RUN = 500;

export async function GET(request: NextRequest) {
  if (!isProd()) {
    return apiOk({ ok: false, message: "cron disabled outside prod" });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return apiUnauthorized();
  }

  const supabase = createSupabaseAdminClient();

  const { data: tokens, error } = await supabase
    .from("spotify_tokens")
    .select("user_id, updated_at")
    .order("updated_at", { ascending: false })
    .limit(MAX_USERS_PER_RUN);

  if (error) {
    console.error("[cron] spotify_tokens query failed", error);
    return apiError("spotify_tokens query failed", 500);
  }

  const userIds = [...new Set((tokens ?? []).map((t) => t.user_id as string))];

  let processed = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map((userId) =>
        ingestRecentPlaysForUser(userId).catch((e) => {
          console.error("[cron] ingest failed for user", userId, e);
          return { inserted: 0, skipped: 0 };
        }),
      ),
    );

    for (const r of results) {
      totalInserted += r.inserted;
      totalSkipped += r.skipped;
    }

    processed += batch.length;
    if (processed >= MAX_USERS_PER_RUN) break;
  }

  console.log(
    "[cron] spotify-ingest complete",
    { processed, totalInserted, totalSkipped },
  );

  return apiOk({
    ok: true,
    processed,
    inserted: totalInserted,
    skipped: totalSkipped,
  });
}

