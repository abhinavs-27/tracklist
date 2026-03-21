import { NextRequest } from "next/server";
import { handleUnauthorized, requireApiAuth } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";

type Body = {
  albums?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const me = await requireApiAuth(request);

    const { data: body, error: parseErr } = await parseBody<Body>(request);
    if (parseErr) return parseErr;

    const raw = Array.isArray(body!.albums) ? body!.albums : [];
    const albumIds = raw
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter((id) => id.length > 0)
      .slice(0, 4);

    const supabase = await createSupabaseServerClient();

    // Clear existing favorites for user, then insert new ones.
    const { error: deleteError } = await supabase
      .from("user_favorite_albums")
      .delete()
      .eq("user_id", me.id);
    if (deleteError) return apiInternalError(deleteError);

    if (albumIds.length > 0) {
      const rows = albumIds.map((id, index) => ({
        user_id: me.id,
        album_id: id,
        position: index + 1,
      }));
      const { error: insertError } = await supabase
        .from("user_favorite_albums")
        .insert(rows);
      if (insertError) return apiInternalError(insertError);
    }

    console.log("[users] favorites-updated", {
      userId: me.id,
      albumIds,
    });

    return apiOk({ albums: albumIds });
  } catch (e) {
    const u = handleUnauthorized(e);
    if (u) return u;
    return apiInternalError(e);
  }
}

