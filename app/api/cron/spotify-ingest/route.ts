import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { ingestRecentPlaysForUser } from "@/lib/logs-ingest";

const BATCH_SIZE = 50;
const MAX_USERS_PER_RUN = 500;

export async function GET() {
  const supabase = createSupabaseAdminClient();

  const { data: tokens, error } = await supabase
    .from("spotify_tokens")
    .select("user_id, updated_at")
    .order("updated_at", { ascending: false })
    .limit(MAX_USERS_PER_RUN);

  if (error) {
    console.error("[cron] spotify_tokens query failed", error);
    return NextResponse.json(
      { ok: false, error: "spotify_tokens query failed" },
      { status: 500 },
    );
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
    JSON.stringify({ processed, totalInserted, totalSkipped }),
  );

  return NextResponse.json({
    ok: true,
    processed,
    inserted: totalInserted,
    skipped: totalSkipped,
  });
}

