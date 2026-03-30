import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import {
  apiBadRequest,
  apiForbidden,
  apiInternalError,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isValidUuid } from "@/lib/validation";

type EntityType = "artist" | "album" | "track";

type SendRecBody = {
  recipientUserId?: string;
  entityType?: string;
  entityId?: string;
  /** Display hints stored with the notification */
  payload?: {
    title?: string;
    subtitle?: string | null;
    imageUrl?: string | null;
    /** For tracks: link to album page */
    albumId?: string | null;
  };
};

function isEntityType(t: string): t is EntityType {
  return t === "artist" || t === "album" || t === "track";
}

export const POST = withHandler(
  async (request: NextRequest, { user: me }) => {
    const parsed = await parseBody<SendRecBody>(request);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const recipientUserId = body?.recipientUserId?.trim();
    const entityType = body?.entityType?.trim();
    const entityId = body?.entityId?.trim();
    const payload = body?.payload;

    if (!recipientUserId || !isValidUuid(recipientUserId)) {
      return apiBadRequest("Invalid recipient");
    }
    if (recipientUserId === me!.id) {
      return apiForbidden("Cannot recommend to yourself");
    }
    if (!entityType || !isEntityType(entityType)) {
      return apiBadRequest("entityType must be artist, album, or track");
    }
    if (!entityId || entityId.length > 200) {
      return apiBadRequest("Invalid entity id");
    }

    const admin = createSupabaseAdminClient();
    const { data: recipient, error: userErr } = await admin
      .from("users")
      .select("id")
      .eq("id", recipientUserId)
      .maybeSingle();
    if (userErr || !recipient) {
      return apiBadRequest("Recipient not found");
    }

    const cleanPayload =
      payload && typeof payload === "object"
        ? {
            title: payload.title?.trim() || undefined,
            subtitle: payload.subtitle?.trim() || null,
            imageUrl: payload.imageUrl?.trim() || null,
            albumId: payload.albumId?.trim() || null,
          }
        : null;

    const { error: insErr } = await admin.from("notifications").insert({
      user_id: recipientUserId,
      actor_user_id: me!.id,
      type: "music_recommendation",
      entity_type: entityType,
      entity_id: entityId,
      payload: cleanPayload,
    });

    if (insErr) {
      console.error("[recommendations/send]", insErr);
      return apiInternalError(insErr);
    }

    return apiOk({ ok: true });
  },
  { requireAuth: true },
);
