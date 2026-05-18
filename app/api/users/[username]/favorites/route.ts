import { NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { apiBadRequest, apiNotFound, apiInternalError, apiOk } from "@/lib/api-response";
import { getUserFavoriteAlbums } from "@/lib/queries";
import { isValidUsername, isValidUuid } from "@/lib/validation";

/** GET /api/users/[username]/favorites — public, works with username or UUID. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    if (!username) return apiBadRequest("username required");

    const admin = createSupabaseAdminClient();

    // Accept either a username string or a UUID directly
    let userId: string | null = null;
    if (isValidUuid(username)) {
      userId = username;
    } else if (isValidUsername(username)) {
      const { data, error } = await admin
        .from("users")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (error) return apiInternalError(error);
      userId = (data as { id: string } | null)?.id ?? null;
    } else {
      return apiBadRequest("Invalid username");
    }

    if (!userId) return apiNotFound("User not found");

    const albums = await getUserFavoriteAlbums(userId, 10);
    return apiOk(albums.map((a) => ({
      album_id: a.album_id,
      name: a.name,
      image_url: a.image_url,
    })));
  } catch (e) {
    return apiInternalError(e);
  }
}
