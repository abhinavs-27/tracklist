import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiForbidden,
  apiInternalError,
  apiNotFound,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { canEditCommunitySettings } from "@/lib/community/permissions";
import {
  getCommunityById,
  getCommunityMemberRole,
  isCommunityMember,
} from "@/lib/community/queries";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isExpectedProfilePictureFileUrl } from "@/lib/profile-pictures/validate-file-url";
import { isValidUuid, validateAvatarUrl } from "@/lib/validation";

export const POST = withHandler(
  async (request, { user: me }) => {
    const { data: body, error: parseErr } = await parseBody<{
      type?: unknown;
      id?: unknown;
      file_url?: unknown;
    }>(request);
    if (parseErr) return parseErr;

    const type = body?.type;
    const id = typeof body?.id === "string" ? body.id.trim() : "";
    if (type !== "user" && type !== "community") {
      return apiBadRequest("type must be user or community");
    }
    if (!id || !isValidUuid(id)) {
      return apiBadRequest("id must be a valid UUID");
    }

    const fileUrl = validateAvatarUrl(body?.file_url);
    if (!fileUrl) {
      return apiBadRequest("file_url must be a valid http(s) URL");
    }
    if (!isExpectedProfilePictureFileUrl(type, id, fileUrl)) {
      return apiBadRequest("file_url does not match this profile picture path");
    }

    if (type === "user") {
      if (id !== me!.id) return apiForbidden();

      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("users")
        .update({ avatar_url: fileUrl })
        .eq("id", me!.id)
        .select("id, username, avatar_url")
        .maybeSingle();

      if (error || !data) {
        return apiInternalError(error ?? new Error("Could not update user"));
      }
      return apiOk({ ok: true, user: data });
    }

    const community = await getCommunityById(id);
    if (!community) return apiNotFound("Community not found");

    const member = await isCommunityMember(id, me!.id);
    const role = await getCommunityMemberRole(id, me!.id);
    if (!canEditCommunitySettings(community.is_private, member, role)) {
      return apiForbidden();
    }

    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("communities")
      .update({ avatar_url: fileUrl })
      .eq("id", id)
      .select(
        "id, name, description, is_private, created_by, created_at, avatar_url",
      )
      .maybeSingle();

    if (error || !data) {
      return apiInternalError(error ?? new Error("Could not update community"));
    }

    return apiOk({ ok: true, community: data });
  },
  { requireAuth: true },
);
