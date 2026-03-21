import type { LogInput } from "./types";

/** JSON body for `POST /api/logs` (shared by web and mobile). */
export function buildLogRequestBody(payload: LogInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    track_id: payload.trackId,
    source: payload.source,
  };
  if (payload.albumId) body.album_id = payload.albumId;
  if (payload.artistId) body.artist_id = payload.artistId;
  if (payload.note?.trim()) body.note = payload.note.trim();
  if (payload.listenedAt) body.listened_at = payload.listenedAt;
  return body;
}
