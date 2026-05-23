import { withHandler } from "@/lib/api-handler";
import { apiOk } from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const GET = withHandler(async (req, ctx) => {
  const { id } = ctx.params;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = 24;
  const from = (page - 1) * limit;

  const supabase = await createSupabaseServerClient();
  const { data, count } = await supabase
    .from("artist_labels")
    .select("artists(id, name, image_url)", { count: "exact" })
    .eq("label_id", id)
    .range(from, from + limit - 1);

  return apiOk({
    artists: (data ?? []).map((r: any) => r.artists),
    total: count ?? 0,
    page,
  });
}, { requireAuth: false });
