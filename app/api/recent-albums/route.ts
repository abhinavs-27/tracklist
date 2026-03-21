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
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    if (!userId || !isValidUuid(userId)) return apiBadRequest("Valid user_id required");

    await getUserFromRequest(request);
    const supabase = createSupabaseAdminClient();

    const albums = await getRecentAlbumsFromLogs(supabase, userId);
    return apiOk({ albums });
  } catch (e) {
    return apiInternalError(e);
  }
}
