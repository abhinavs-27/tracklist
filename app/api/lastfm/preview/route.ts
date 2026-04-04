import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { buildLastfmPreview } from "@/lib/lastfm/build-preview";
import { apiBadRequest, apiInternalError, apiOk } from "@/lib/api-response";
import { clampLimit } from "@/lib/validation";

export const GET = withHandler(async (request: NextRequest, { user: me }) => {
  const { searchParams } = new URL(request.url);
  const limit = clampLimit(searchParams.get("limit"), 200, 50);

  const supabase = await createSupabaseServerClient();
  const { data: user, error } = await supabase
    .from("users")
    .select("lastfm_username")
    .eq("id", me!.id)
    .maybeSingle();

  if (error) return apiInternalError(error);

  const username = user?.lastfm_username?.trim();
  if (!username) {
    return apiBadRequest("Set a Last.fm username in profile settings first");
  }

  const preview = await buildLastfmPreview(username, limit);

  return apiOk({
    items: preview.items,
    limit,
    matchedCount: preview.matchedCount,
    skippedCount: preview.skippedCount,
    error: preview.fetchError,
    errorCode: preview.fetchErrorCode,
  });
}, { requireAuth: true });
