import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getUserLists } from "@/lib/queries";
import { apiBadRequest, apiNotFound, apiInternalError } from "@/lib/api-response";
import { isValidUsername } from "@/lib/validation";
import { clampLimit } from "@/lib/validation";

/** GET – user's lists by username (title, item count, created_at). Public. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    if (!username || !isValidUsername(username)) return apiBadRequest("Invalid username");

    const supabase = await createSupabaseServerClient();
    const { data: user, error } = await supabase
      .from("users")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (error) return apiInternalError(error);
    if (!user) return apiNotFound("User not found");

    const { searchParams } = new URL(request.url);
    const limit = clampLimit(searchParams.get("limit"), 100, 50);
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

    const lists = await getUserLists(user.id, limit, offset);
    return NextResponse.json(lists);
  } catch (e) {
    return apiInternalError(e);
  }
}
