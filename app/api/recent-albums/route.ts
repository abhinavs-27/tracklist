import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  getRecentAlbumsFromLogs,
  type RecentAlbumItem,
} from "@/lib/recent-from-logs";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

export type { RecentAlbumItem };

/** Recent unique albums — derived only from `logs` + catalog (all listen sources). */
export const GET = withHandler(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");
  if (!userId || !isValidUuid(userId)) return apiBadRequest("Valid user_id required");

  const supabase = createSupabaseAdminClient();

  const albums = await getRecentAlbumsFromLogs(supabase, userId);
  return apiOk({ albums });
});
