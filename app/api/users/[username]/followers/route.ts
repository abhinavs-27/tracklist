import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getFollowListWithStatus } from "@/lib/queries";
import {
  apiBadRequest,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import { clampLimit } from "@/lib/validation";

export const GET = withHandler(async (request: NextRequest, { params, user: viewer }) => {
  const { username } = params;
  if (!username?.trim()) return apiNotFound("User not found");

  const supabase = await createSupabaseServerClient();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("username", username.trim())
    .maybeSingle();

  if (userError || !user) return apiNotFound("User not found");
  const userId = user.id;

  const viewerId = viewer?.id ?? null;

  const { searchParams } = new URL(request.url);
  const limit = clampLimit(searchParams.get("limit"), 50, 20);
  const offset = Number(searchParams.get("offset")) || 0;
  if (offset < 0) return apiBadRequest("offset must be >= 0");

  const result = await getFollowListWithStatus(userId, viewerId, "followers", {
    limit,
    offset,
  });

  return apiOk(result);
});
