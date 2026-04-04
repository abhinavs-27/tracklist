import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk, apiTooManyRequests } from "@/lib/api-response";
import { checkSpotifyRateLimit } from "@/lib/rate-limit";
import { getOrFetchTrack } from "@/lib/spotify-cache";
import { isValidSpotifyId } from "@/lib/validation";

export const GET = withHandler(async (request, { params }) => {
  if (!checkSpotifyRateLimit(request)) {
    return apiTooManyRequests();
  }

  const { id } = params;
  if (!isValidSpotifyId(id)) return apiBadRequest("Invalid Spotify id");

  const track = await getOrFetchTrack(id);

  const album = track.album;
  const artworkImageUrl = album?.images?.[0]?.url ?? null;
  const artist = (track.artists ?? []).map((a) => a.name).filter(Boolean).join(", ");
  const artist_id = (track.artists ?? [])[0]?.id ?? null;
  const release_date = album?.release_date ?? null;

  return apiOk({
    id: track.id,
    name: track.name,
    artist,
    artist_id,
    image_url: artworkImageUrl,
    release_date,
    album_name: album?.name ?? null,
    album_id: album?.id ?? null,
  });
});

