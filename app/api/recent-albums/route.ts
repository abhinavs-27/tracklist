import { NextRequest } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getRecentAlbumsFromLogs,
  type RecentAlbumItem,
} from "@/lib/recent-from-logs";
import { apiBadRequest, apiInternalError, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

export type { RecentAlbumItem };

/** Recent unique albums — derived only from `logs` + catalog (all listen sources). */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const userId = searchParams.get("user_id");
    if (!userId || !isValidUuid(userId)) return apiBadRequest("Valid user_id required");

    await getUserFromRequest(request);
    const supabase = createSupabaseAdminClient();

    const limitRaw = searchParams.get("limit");
    const limit = limitRaw
      ? Math.min(48, Math.max(1, parseInt(limitRaw, 10) || 12))
      : 12;

    const albums = await getRecentAlbumsFromLogs(supabase, userId, limit);
    return apiOk({ albums });
  } catch (e) {
    return apiInternalError(e);
  }
}
