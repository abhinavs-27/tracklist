import { Router } from "express";
import { badRequest, internalError, ok, tooManyRequests } from "../lib/http";
import { checkSpotifyRateLimit } from "../lib/rateLimit";
import { isSpotifyIntegrationEnabled } from "../lib/spotify-integration-enabled";
import { getTrack } from "../lib/spotify";
import { isValidSpotifyId } from "../../lib/validation";

export const spotifyDataRouter = Router();

/** GET /api/spotify/song/:id */
spotifyDataRouter.get("/song/:id", async (req, res) => {
  if (!checkSpotifyRateLimit(req)) return tooManyRequests(res);
  try {
    const { id } = req.params;
    if (!isValidSpotifyId(id)) return badRequest(res, "Invalid Spotify id");

    if (!isSpotifyIntegrationEnabled()) {
      return badRequest(res, "Spotify integration is temporarily disabled.");
    }

    const track = await getTrack(id);
    const album = track.album;
    const artworkImageUrl = album?.images?.[0]?.url ?? null;
    const artist = (track.artists ?? [])
      .map((a) => a.name)
      .filter(Boolean)
      .join(", ");
    const artist_id = (track.artists ?? [])[0]?.id ?? null;
    const release_date = album?.release_date ?? null;

    return ok(res, {
      id: track.id,
      name: track.name,
      artist,
      artist_id,
      image_url: artworkImageUrl,
      release_date,
      album_name: album?.name ?? null,
      album_id: album?.id ?? null,
    });
  } catch (e) {
    return internalError(res, e);
  }
});
