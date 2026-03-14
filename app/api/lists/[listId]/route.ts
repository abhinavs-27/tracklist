import { NextRequest, NextResponse } from "next/server";
import { getList } from "@/lib/queries";
import { getOrFetchAlbum } from "@/lib/spotify-cache";
import { getOrFetchTrack } from "@/lib/spotify-cache";
import { apiNotFound, apiInternalError } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";

export type ListItemEnriched = {
  id: string;
  list_id: string;
  entity_type: "album" | "song";
  entity_id: string;
  position: number;
  added_at: string;
  album?: SpotifyApi.AlbumObjectSimplified | SpotifyApi.AlbumObjectFull;
  track?: SpotifyApi.TrackObjectSimplified | SpotifyApi.TrackObjectFull;
};

/** GET – list details + ordered items with album/song info. Public. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    if (!isValidUuid(listId)) return apiNotFound("List not found");

    const data = await getList(listId);
    if (!data) return apiNotFound("List not found");

    const enriched: ListItemEnriched[] = [];
    for (const item of data.items) {
      try {
        if (item.entity_type === "album") {
          const { album } = await getOrFetchAlbum(item.entity_id);
          enriched.push({
            ...item,
            album: album as SpotifyApi.AlbumObjectSimplified,
          });
        } else {
          const track = await getOrFetchTrack(item.entity_id);
          enriched.push({ ...item, track });
        }
      } catch (e) {
        console.warn(`[lists] Failed to fetch ${item.entity_type} ${item.entity_id}:`, e);
        enriched.push({ ...item });
      }
    }

    return NextResponse.json({
      list: data.list,
      owner_username: data.owner_username,
      items: enriched,
    });
  } catch (e) {
    return apiInternalError(e);
  }
}
