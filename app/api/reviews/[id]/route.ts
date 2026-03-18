import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  apiUnauthorized,
  apiBadRequest,
  apiNotFound,
  apiForbidden,
  apiInternalError,
  apiOk,
  apiNoContent,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { isValidUuid } from "@/lib/validation";
import { validateReviewContent } from "@/lib/validation";

type RouteParams = Promise<{ id: string }>;

/** PATCH – update own review */
export async function PATCH(
  request: NextRequest,
  ctx: { params: RouteParams }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { id } = await ctx.params;
    if (!isValidUuid(id)) return apiBadRequest("Invalid review id");

    const { data: body, error: parseErr } = await parseBody<Record<string, unknown>>(request);
    if (parseErr) return parseErr;

    const { rating, review_text } = body!;

    const supabase = await createSupabaseServerClient();
    const { data: existing, error: fetchErr } = await supabase
      .from("reviews")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) return apiNotFound("Review not found");
    if (existing.user_id !== session.user.id) return apiForbidden("Not your review");

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (rating != null) {
      const r = Number(rating);
      if (!Number.isInteger(r) || r < 1 || r > 5) {
        return apiBadRequest("rating must be an integer 1–5");
      }
      updates.rating = r;
    }
    if (review_text !== undefined) {
      updates.review_text = validateReviewContent(review_text);
    }

    const { data, error } = await supabase
      .from("reviews")
      .update(updates)
      .eq("id", id)
      .select("id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at")
      .single();

    if (error) return apiInternalError(error);
    console.log("[reviews] review updated", {
      userId: session.user.id,
      reviewId: data.id,
    });
    return apiOk(data);
  } catch (e) {
    return apiInternalError(e);
  }
}

/** DELETE – delete own review */
export async function DELETE(
  _request: NextRequest,
  ctx: { params: RouteParams }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { id } = await ctx.params;
    if (!isValidUuid(id)) return apiBadRequest("Invalid review id");

    const supabase = await createSupabaseServerClient();
    const { data: existing, error: fetchErr } = await supabase
      .from("reviews")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (fetchErr || !existing) return apiNotFound("Review not found");
    if (existing.user_id !== session.user.id) return apiForbidden("Not your review");

    const { error } = await supabase.from("reviews").delete().eq("id", id);
    if (error) return apiInternalError(error);
    console.log("[reviews] review deleted", {
      userId: session.user.id,
      reviewId: id,
    });
    return apiNoContent();
  } catch (e) {
    return apiInternalError(e);
  }
}
