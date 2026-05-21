import { NextRequest } from "next/server";
import { apiOk, apiUnauthorized, apiInternalError } from "@/lib/api-response";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

function parseSince(raw: string | null): string {
  if (!raw) return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (raw === "7d")  return new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();
  if (raw === "30d") return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  if (raw === "90d") return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const d = new Date(raw);
  if (isNaN(d.getTime())) return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return d.toISOString();
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) return apiUnauthorized();
  }

  const { searchParams } = new URL(request.url);
  const jobFilter = searchParams.get("job");
  const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(500, Math.max(1, isNaN(limitRaw) ? 50 : limitRaw));
  const since = parseSince(searchParams.get("since"));

  const admin = createSupabaseAdminClient();

  let query = admin
    .from("job_runs")
    .select("id, job_name, started_at, duration_ms, status, fast_path, items_ok, items_failed, meta")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (jobFilter) query = query.eq("job_name", jobFilter);

  const { data: runs, error: runsErr } = await query;
  if (runsErr) {
    console.error("[admin/job-runs] fetch runs", runsErr.message);
    return apiInternalError(runsErr);
  }

  // Build summary from fetched rows — no second DB query needed
  const summaryMap = new Map<string, {
    runs: number; ok: number; error: number; skipped: number;
    total_ms: number; fast_path_hits: number; fast_path_total: number;
  }>();

  for (const row of runs ?? []) {
    const r = row as {
      job_name: string; status: string; duration_ms: number | null;
      fast_path: boolean | null;
    };
    let s = summaryMap.get(r.job_name);
    if (!s) {
      s = { runs: 0, ok: 0, error: 0, skipped: 0, total_ms: 0, fast_path_hits: 0, fast_path_total: 0 };
      summaryMap.set(r.job_name, s);
    }
    s.runs += 1;
    if (r.status === "ok") s.ok += 1;
    else if (r.status === "error") s.error += 1;
    else s.skipped += 1;
    if (r.duration_ms != null) s.total_ms += r.duration_ms;
    if (r.fast_path != null) {
      s.fast_path_total += 1;
      if (r.fast_path) s.fast_path_hits += 1;
    }
  }

  const summary: Record<string, {
    runs: number; ok: number; error: number; skipped: number;
    avg_ms: number; fast_path_rate: number | null;
  }> = {};

  for (const [name, s] of summaryMap) {
    summary[name] = {
      runs: s.runs,
      ok: s.ok,
      error: s.error,
      skipped: s.skipped,
      avg_ms: s.runs > 0 ? Math.round(s.total_ms / s.runs) : 0,
      fast_path_rate: s.fast_path_total > 0
        ? Math.round((s.fast_path_hits / s.fast_path_total) * 100) / 100
        : null,
    };
  }

  return apiOk({ runs: runs ?? [], summary });
}
