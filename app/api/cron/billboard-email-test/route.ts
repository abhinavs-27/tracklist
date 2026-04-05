import { NextRequest, NextResponse } from "next/server";
import {
  apiBadRequest,
  apiError,
  apiOk,
  apiUnauthorized,
} from "@/lib/api-response";
import { normalizeEmail } from "@/lib/auth/utils";
import { sendBillboardWeeklyDigestEmail } from "@/lib/email/send-billboard-weekly-email";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isValidUuid } from "@/lib/validation";

type Inputs = {
  to?: string;
  userId?: string;
  userEmail?: string;
};

function requireCronAuth(request: NextRequest): ReturnType<typeof apiUnauthorized> | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return apiUnauthorized();
    }
  }
  return null;
}

/**
 * ILIKE treats `%` and `_` as wildcards; escape so the pattern matches the literal address.
 */
function escapeForIlikeLiteral(email: string): string {
  return email.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Query `+` in URLs is often decoded as a space — repair `user tag@x` → `user+tag@x` in the local part.
 */
function emailCandidatesFromRaw(raw: string): string[] {
  const trimmed = raw.trim();
  const out = new Set<string>();
  out.add(normalizeEmail(trimmed));
  const at = trimmed.indexOf("@");
  if (at > 0 && /\s/.test(trimmed.slice(0, at))) {
    const local = trimmed.slice(0, at).replace(/\s+/g, "+");
    const domain = trimmed.slice(at + 1);
    out.add(normalizeEmail(`${local}@${domain}`));
  }
  return [...out];
}

/** Query string wins when a value is present (handy for `?userEmail=`). */
function mergeInputs(request: NextRequest, body: Inputs): Inputs {
  const sp = request.nextUrl.searchParams;
  const fromQuery =
    sp.get("userEmail")?.trim() ||
    sp.get("user_email")?.trim() ||
    undefined;
  return {
    to: sp.get("to")?.trim() || body.to?.trim(),
    userId: sp.get("userId")?.trim() || body.userId?.trim(),
    userEmail: fromQuery || body.userEmail?.trim(),
  };
}

async function readJsonBody(
  request: NextRequest,
): Promise<Inputs | NextResponse> {
  try {
    const text = await request.text();
    if (!text.trim()) return {};
    const data = JSON.parse(text) as unknown;
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      return apiBadRequest("Invalid JSON body");
    }
    return data as Inputs;
  } catch {
    return apiBadRequest("Invalid JSON body");
  }
}

async function run(request: NextRequest, body: Inputs) {
  const merged = mergeInputs(request, body);

  const to = merged.to?.trim();
  if (!to) {
    return apiBadRequest(
      "Missing `to` (recipient email). Use query or JSON body.",
    );
  }

  const userIdRaw = merged.userId?.trim();
  const userEmailRaw = merged.userEmail?.trim();

  if (userIdRaw && userEmailRaw) {
    return apiBadRequest("Provide only one of `userId` or `userEmail`");
  }
  if (!userIdRaw && !userEmailRaw) {
    return apiBadRequest(
      "Provide `userId` or `userEmail` for whose chart to render",
    );
  }

  const admin = createSupabaseAdminClient();
  let userId: string;

  if (userIdRaw) {
    if (!isValidUuid(userIdRaw)) {
      return apiBadRequest("Invalid `userId`");
    }
    const { data: u, error } = await admin
      .from("users")
      .select("id")
      .eq("id", userIdRaw)
      .maybeSingle();
    if (error || !u?.id) {
      return apiBadRequest("User not found");
    }
    userId = u.id;
  } else {
    let resolvedId: string | null = null;
    for (const candidate of emailCandidatesFromRaw(userEmailRaw!)) {
      const { data: byEq } = await admin
        .from("users")
        .select("id")
        .eq("email", candidate)
        .maybeSingle();
      if (byEq?.id) {
        resolvedId = byEq.id;
        break;
      }
      const { data: byIlike } = await admin
        .from("users")
        .select("id")
        .ilike("email", escapeForIlikeLiteral(candidate))
        .maybeSingle();
      if (byIlike?.id) {
        resolvedId = byIlike.id;
        break;
      }
    }
    if (!resolvedId) {
      return apiBadRequest(
        "No user with that `userEmail`. If the address contains `+`, use `%2B` instead of `+` in the query string (e.g. user%2Btag@gmail.com). Lookup is case-insensitive.",
      );
    }
    userId = resolvedId;
  }

  const { data: weekRow, error: wErr } = await admin
    .from("user_weekly_charts")
    .select("week_start")
    .eq("user_id", userId)
    .eq("chart_type", "tracks")
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (wErr || !weekRow?.week_start) {
    return apiBadRequest(
      "No tracks weekly chart for this user — need listens + weekly chart data first.",
    );
  }

  const weekStart = weekRow.week_start as string;

  try {
    const sendResult = await sendBillboardWeeklyDigestEmail({
      userId,
      email: to,
      weekStart,
    });
    if (!sendResult.ok) {
      return apiError(sendResult.reason, 502);
    }
    return apiOk({
      ok: true,
      to,
      userId,
      week_start: weekStart,
    });
  } catch (e) {
    console.error("[cron] billboard-email-test", e);
    return apiError("Send failed", 500);
  }
}

/**
 * One-off test send: same template as `/api/cron/billboard-weekly-email`, single recipient.
 *
 * Query params (optional; can mix with POST JSON — query wins when set):
 * `to`, `userEmail`, `userId`
 *
 * Examples:
 *   curl -sS -X POST "$ORIGIN/api/cron/billboard-email-test?userEmail=a@b.com" \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"to":"you@gmail.com"}'
 *
 *   curl -sS "$ORIGIN/api/cron/billboard-email-test?to=you@gmail.com&userEmail=login@tracklist.com" \
 *     -H "Authorization: Bearer $CRON_SECRET"
 *
 * Requires `RESEND_API_KEY` + `RESEND_FROM`. Authorization: Bearer CRON_SECRET when set.
 */
export async function GET(request: NextRequest) {
  const authErr = requireCronAuth(request);
  if (authErr) return authErr;
  return run(request, {});
}

export async function POST(request: NextRequest) {
  const authErr = requireCronAuth(request);
  if (authErr) return authErr;

  const bodyOrErr = await readJsonBody(request);
  if (bodyOrErr instanceof Response) return bodyOrErr;

  return run(request, bodyOrErr);
}
