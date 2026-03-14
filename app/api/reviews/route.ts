import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  apiUnauthorized,
  apiBadRequest,
  apiInternalError,
} from "@/lib/api-response";
import { isValidSpotifyId } from "@/lib/validation";
import { validateReviewContent } from "@/lib/validation";
import { clampLimit } from "@/lib/validation";

/** GET ?entity_type=album|song&entity_id=<spotify_id>&limit= optional */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entity_type");
    const entityId = searchParams.get("entity_id");
    const limit = clampLimit(searchParams.get("limit"), 50, 10);

    if (!entityType || !entityId) {
      return apiBadRequest("entity_type and entity_id required");
    }
    if (entityType !== "album" && entityType !== "song") {
      return apiBadRequest("entity_type must be album or song");
    }
    if (!isValidSpotifyId(entityId)) {
      return apiBadRequest("Invalid entity_id (Spotify ID)");
    }

    const supabase = await createSupabaseServerClient();

    const { data: rows, error } = await supabase
      .from("reviews")
      .select("id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return apiInternalError(error);

    const session = await getServerSession(authOptions);
    const userId = session?.user?.id ?? null;

    const reviewRows = rows ?? [];
    const userIds = [...new Set(reviewRows.map((r) => r.user_id))];
    const { data: users } = await supabase
      .from("users")
      .select("id, username, avatar_url")
      .in("id", userIds);
    const userMap = new Map((users ?? []).map((u) => [u.id, u]));

    const reviews = reviewRows.map((r) => {
      const u = userMap.get(r.user_id);
      return {
        id: r.id,
        user_id: r.user_id,
        username: u?.username ?? null,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        rating: r.rating,
        review_text: r.review_text ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        user: u ? { id: u.id, username: u.username, avatar_url: u.avatar_url ?? null } : null,
      };
    });

    const count = reviews.length;
    const sum = reviews.reduce((a, r) => a + r.rating, 0);
    const average_rating = count > 0 ? Math.round((sum / count) * 10) / 10 : null;

    const { count: total_count } = await supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("entity_type", entityType)
      .eq("entity_id", entityId);

    let my_review: (typeof reviews)[0] | null = null;
    if (userId) {
      const { data: myRow } = await supabase
        .from("reviews")
        .select("id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("user_id", userId)
        .maybeSingle();
      if (myRow) {
        const sessionUser = session?.user as { id?: string; username?: string; image?: string | null } | undefined;
        my_review = {
          id: myRow.id,
          user_id: myRow.user_id,
          username: sessionUser?.username ?? null,
          entity_type: myRow.entity_type,
          entity_id: myRow.entity_id,
          rating: myRow.rating,
          review_text: myRow.review_text ?? null,
          created_at: myRow.created_at,
          updated_at: myRow.updated_at,
          user: sessionUser
            ? { id: sessionUser.id ?? myRow.user_id, username: sessionUser.username ?? "", avatar_url: sessionUser.image ?? null }
            : null,
        };
      }
    }

    return NextResponse.json({
      reviews,
      average_rating,
      count: total_count ?? reviews.length,
      my_review,
    });
  } catch (e) {
    return apiInternalError(e);
  }
}

/** POST – create or upsert review (one per user per entity) */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiBadRequest("Invalid JSON");
    }
    const b = body as Record<string, unknown>;
    const { entity_type, entity_id, rating, review_text } = b;

    if (!entity_type || !entity_id || rating == null) {
      return apiBadRequest("entity_type, entity_id, and rating required");
    }
    if (entity_type !== "album" && entity_type !== "song") {
      return apiBadRequest("entity_type must be album or song");
    }
    if (!isValidSpotifyId(entity_id)) {
      return apiBadRequest("Invalid entity_id (Spotify ID)");
    }
    const r = Number(rating);
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return apiBadRequest("rating must be an integer 1–5");
    }
    const reviewText = validateReviewContent(review_text);

    const supabase = await createSupabaseServerClient();
    const row = {
      user_id: session.user.id,
      entity_type: entity_type as string,
      entity_id: entity_id as string,
      rating: r,
      review_text: reviewText,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("reviews")
      .upsert(row, {
        onConflict: "user_id,entity_type,entity_id",
      })
      .select("id, user_id, entity_type, entity_id, rating, review_text, created_at, updated_at")
      .single();

    if (error) return apiInternalError(error);
    return NextResponse.json(data);
  } catch (e) {
    return apiInternalError(e);
  }
}
