import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * Cron: refresh precomputed entity stats (album_stats, track_stats).
 * Call with: Authorization: Bearer <CRON_SECRET>
 * Schedule periodically (e.g. every 15–60 min) to keep stats fresh.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.rpc("refresh_entity_stats");

  if (error) {
    console.error("[cron] refresh-stats RPC failed", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
