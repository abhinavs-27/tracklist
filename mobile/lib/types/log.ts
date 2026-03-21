/** Sources accepted by `POST /api/logs` for mobile quick logging. */
export type LogSource = "manual" | "suggested" | "session";

/**
 * Client payload for `POST /api/logs`. The authenticated session supplies
 * `user_id`; do not send `userId` in the body.
 */
export type LogInput = {
  trackId: string;
  albumId?: string | null;
  artistId?: string | null;
  note?: string | null;
  source: LogSource;
  listenedAt?: string;
};

/** @deprecated Use `LogInput` */
export type CreateLogPayload = LogInput;

export type LogRow = {
  id: string;
  user_id: string;
  track_id: string;
  listened_at: string;
  source: string | null;
  created_at: string;
  album_id?: string | null;
  artist_id?: string | null;
  note?: string | null;
};
