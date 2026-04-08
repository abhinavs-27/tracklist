import { withHandler } from "@/lib/api-handler";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  apiBadRequest,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";

type Body = { logs_private: boolean };

export const PATCH = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<Body>(request);
    if (parseErr) return parseErr;

    if (typeof body!.logs_private !== "boolean") {
      return apiBadRequest("logs_private must be a boolean");
    }

    const supabase = await createSupabaseServerClient();
    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update({ logs_private: body!.logs_private })
      .eq("id", me!.id)
      .select("id, logs_private")
      .maybeSingle();

    if (updateError || !updated) {
      return apiInternalError(updateError ?? new Error("Update failed"));
    }

    return apiOk(updated);
  },
  { requireAuth: true },
);
