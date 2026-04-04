import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { FavoriteUpdateBody } from "@/types";

export const POST = withHandler(async (request: NextRequest, { user: me }) => {
  const { data: body, error: parseErr } = await parseBody<FavoriteUpdateBody>(request);
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
    .eq("user_id", me!.id);
  if (deleteError) return apiInternalError(deleteError);

  if (albumIds.length > 0) {
    const rows = albumIds.map((id, index) => ({
      user_id: me!.id,
      album_id: id,
      position: index + 1,
    }));
    const { error: insertError } = await supabase
      .from("user_favorite_albums")
      .insert(rows);
    if (insertError) return apiInternalError(insertError);
  }

  console.log("[users] favorites-updated", {
    userId: me!.id,
    albumIds,
  });

  const admin = createSupabaseAdminClient();
  const { error: syncErr } = await admin.rpc(
    "sync_favorite_counts_from_user_favorite_albums",
  );
  if (syncErr) {
    console.error("[users] sync_favorite_counts_from_user_favorite_albums", syncErr);
  }

  return apiOk({ albums: albumIds });
}, { requireAuth: true });
