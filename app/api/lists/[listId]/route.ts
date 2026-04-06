import { withHandler } from "@/lib/api-handler";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  albumDisplayMetadataComplete,
  scheduleAlbumEnrichment,
  scheduleTrackEnrichment,
  trackDisplayMetadataComplete,
} from "@/lib/catalog/non-blocking-enrichment";
import { getList, getListOwnerId } from "@/lib/queries";
import { getOrFetchAlbum } from "@/lib/spotify-cache";
import { getOrFetchTrack } from "@/lib/spotify-cache";
import {
  apiNotFound,
  apiInternalError,
  apiForbidden,
  apiBadRequest,
  apiOk,
} from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { ListUpdateBody } from "@/types";
import {
  isValidUuid,
  validateListTitle,
  validateListDescription,
} from "@/lib/validation";

export type ListItemEnriched = {
  id: string;
  list_id: string;
  entity_type: "album" | "song";
  entity_id: string;
  position: number;
  added_at: string;
  album?: SpotifyApi.AlbumObjectSimplified | SpotifyApi.AlbumObjectFull;
  track?: SpotifyApi.TrackObjectSimplified | SpotifyApi.TrackObjectFull;
  metadata_complete?: boolean;
};

/** GET – list details + ordered items with album/song info. Public. */
export const GET = withHandler(async (_request, { params }) => {
  const { listId } = params;
  if (!isValidUuid(listId)) return apiNotFound("List not found");

  const data = await getList(listId);
  if (!data) return apiNotFound("List not found");

  const enriched: ListItemEnriched[] = await Promise.all(
    data.items.map(async (item) => {
      try {
        if (item.entity_type === "album") {
          const { album, tracks } = await getOrFetchAlbum(item.entity_id, {
            allowNetwork: false,
          });
          const metadata_complete = albumDisplayMetadataComplete(album, tracks);
          if (!metadata_complete) {
            scheduleAlbumEnrichment(item.entity_id);
          }
          return {
            ...item,
            album: album as SpotifyApi.AlbumObjectSimplified,
            metadata_complete,
          };
        }
        const track = await getOrFetchTrack(item.entity_id, {
          allowNetwork: false,
        });
        const metadata_complete = trackDisplayMetadataComplete(track);
        if (!metadata_complete) {
          scheduleTrackEnrichment(item.entity_id);
        }
        return { ...item, track, metadata_complete };
      } catch (e) {
        console.warn(
          `[lists] Failed to fetch ${item.entity_type} ${item.entity_id}:`,
          e,
        );
        return { ...item, metadata_complete: false };
      }
    }),
  );

  return apiOk({
    list: data.list,
    owner_username: data.owner_username,
    items: enriched,
  });
});

/** PATCH – update list metadata (title, description, visibility, emoji/image). Auth + ownership required. */
export const PATCH = withHandler(
  async (request, { user: me, params }) => {
    const { listId } = params;
    if (!isValidUuid(listId)) return apiNotFound("List not found");

    const ownerId = await getListOwnerId(listId);
    if (!ownerId || ownerId !== me!.id) {
      return apiForbidden("You do not own this list");
    }

    const { data: body, error: bodyError } = await parseBody<ListUpdateBody>(request);
    if (bodyError) return bodyError;

    const updates: Record<string, unknown> = {};

    if (body.title !== undefined) {
      const titleResult = validateListTitle(body.title);
      if (!titleResult.ok) return apiBadRequest(titleResult.error);
      updates.title = titleResult.value;
    }
    if (body.description !== undefined) {
      updates.description = validateListDescription(body.description);
    }
    if (body.visibility !== undefined) {
      const v = body.visibility;
      if (v !== "public" && v !== "friends" && v !== "private") {
        return apiBadRequest("Invalid visibility");
      }
      updates.visibility = v;
    }
    if (body.image_url !== undefined) {
      updates.image_url =
        typeof body.image_url === "string" && body.image_url.length > 0
          ? body.image_url
          : null;
    }

    if (Object.keys(updates).length === 0) {
      return apiBadRequest("No fields to update");
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("lists")
      .update(updates)
      .eq("id", listId)
      .select(
        "id, user_id, title, description, type, visibility, emoji, image_url, created_at",
      )
      .maybeSingle();

    if (error || !data)
      return apiInternalError(error ?? new Error("Update failed"));

    console.log("[lists] list-updated", {
      userId: me!.id,
      listId,
    });

    return apiOk(data);
  },
  { requireAuth: true },
);

/** DELETE – delete a list (and its items via CASCADE). Auth + ownership required. */
export const DELETE = withHandler(
  async (request, { user: me, params }) => {
    const { listId } = params;
    if (!isValidUuid(listId)) return apiNotFound("List not found");

    const ownerId = await getListOwnerId(listId);
    if (!ownerId || ownerId !== me!.id) {
      return apiForbidden("You do not own this list");
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.from("lists").delete().eq("id", listId);
    if (error) return apiInternalError(error);

    console.log("[lists] list-deleted", {
      userId: me!.id,
      listId,
    });

    return apiOk({ success: true });
  },
  { requireAuth: true },
);
