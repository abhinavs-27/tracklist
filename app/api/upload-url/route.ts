import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiError,
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
import {
  isProfilePictureUploadConfigured,
  profilePictureObjectKey,
} from "@/lib/profile-pictures/config";
import { profilePictureProxyUrlAbsolute } from "@/lib/profile-pictures/display-url";
import { presignProfilePicturePut } from "@/lib/profile-pictures/presign";
import { isValidUuid } from "@/lib/validation";

export const POST = withHandler(
  async (request, { user: me }) => {
    if (!isProfilePictureUploadConfigured()) {
      return apiError("Profile picture upload is not configured", 503);
    }

    const { data: body, error: parseErr } = await parseBody<{
      type?: unknown;
      id?: unknown;
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

    if (type === "user") {
      if (id !== me!.id) return apiForbidden();
    } else {
      const community = await getCommunityById(id);
      if (!community) return apiNotFound("Community not found");
      const member = await isCommunityMember(id, me!.id);
      const role = await getCommunityMemberRole(id, me!.id);
      if (!canEditCommunitySettings(community.is_private, member, role)) {
        return apiForbidden();
      }
    }

    const key = profilePictureObjectKey(type, id);
    let file_url: string;
    try {
      file_url = profilePictureProxyUrlAbsolute(type, id);
    } catch (e) {
      return apiInternalError(e);
    }

    let upload_url: string;
    try {
      upload_url = await presignProfilePicturePut(key);
    } catch (e) {
      return apiInternalError(e);
    }

    return apiOk({ upload_url, file_url });
  },
  { requireAuth: true },
);
