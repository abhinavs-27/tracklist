import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  apiBadRequest,
  apiConflict,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { enqueueLastfmFullImport } from "@/lib/jobs/lastfmQueue";

const ADMIN_EMAIL = "singh.avi99@gmail.com";

async function notifyAdminOfPendingImport(userId: string, lastfmUsername: string, trackilstUsername: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!key || !from) {
    console.warn("[lastfm] RESEND_API_KEY or RESEND_FROM not set — skipping admin notification");
    return;
  }

  const command = `USER_ID=${userId} npm run lastfm:run-local`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: ADMIN_EMAIL,
      subject: `[Tracklist] Last.fm import requested by ${trackilstUsername}`,
      text: `${trackilstUsername} (${userId}) wants to import their Last.fm history.\n\nLast.fm username: ${lastfmUsername}\n\nRun this locally:\n\n  ${command}\n`,
    }),
  }).catch((e) => console.error("[lastfm] admin email failed", e));
}

export async function POST(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);

    const supabase = await createSupabaseServerClient();
    const { data: user, error } = await supabase
      .from("users")
      .select("username, lastfm_username, lastfm_import_status")
      .eq("id", me.id)
      .maybeSingle();

    if (error) return apiInternalError(error);

    const username = user?.lastfm_username?.trim();
    if (!username) return apiBadRequest("Save a Last.fm username first.");

    const status = user?.lastfm_import_status;
    if (status === "pending" || status === "running") {
      return apiConflict("An import is already in progress.");
    }

    const admin = createSupabaseAdminClient();
    const { error: updateErr } = await admin
      .from("users")
      .update({
        lastfm_import_status: "pending",
        lastfm_import_progress: {},
      })
      .eq("id", me.id);

    if (updateErr) return apiInternalError(updateErr);

    // Try to enqueue via BullMQ (no-ops if Redis isn't configured).
    try {
      await enqueueLastfmFullImport({
        userId: me.id,
        lastfmUsername: username,
        fromIso: "1970-01-01T00:00:00.000Z",
      });
      console.log("[lastfm] full-import enqueued", { userId: me.id });
    } catch (e) {
      console.warn("[lastfm] BullMQ unavailable, falling back to admin notification", e);
    }

    // Always notify so the import gets run even without a live worker.
    void notifyAdminOfPendingImport(me.id, username, user?.username ?? me.id);

    return apiOk({ status: "pending" });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}
