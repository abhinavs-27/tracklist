import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { getAlbums } from "@/lib/spotify";
import { apiBadRequest, apiTooManyRequests, apiOk } from "@/lib/api-response";
import { isValidSpotifyId } from "@/lib/validation";
import { checkSpotifyRateLimit } from "@/lib/rate-limit";

const MAX_IDS = 20;

export type AlbumMetadataItem = {
  id: string;
  name: string;
  images: { url: string; width?: number | null; height?: number | null }[];
  artists: { id: string; name: string }[];
  release_date: string | null;
};

export const GET = withHandler(async (request: NextRequest) => {
  if (!checkSpotifyRateLimit(request)) {
    return apiTooManyRequests();
  }

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");
  if (!idsParam || typeof idsParam !== "string") {
    return apiBadRequest("Missing or invalid ids query (comma-separated album ids)");
  }
  const rawIds = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
  const ids = rawIds.filter((id) => isValidSpotifyId(id)).slice(0, MAX_IDS);
  if (ids.length === 0) return apiBadRequest("No valid Spotify album ids provided");

  const albums = await getAlbums(ids);
  const result: AlbumMetadataItem[] = albums.map((a) => ({
    id: a.id,
    name: a.name,
    images: a.images ?? [],
    artists: (a.artists ?? []).map((ar) => ({ id: ar.id, name: ar.name })),
    release_date: a.release_date ?? null,
  }));

  return apiOk(result, {
    headers: {
      "Cache-Control":
        "public, max-age=300, s-maxage=300, stale-while-revalidate=86400",
    },
  });
});
