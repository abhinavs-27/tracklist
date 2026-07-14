export type ReviewEntityResolution =
  | { kind: "resolved"; id: string }
  /** In catalog nowhere yet and network resolution failed — the client should retry. */
  | { kind: "pending" };

export type ReviewEntityResolvers = {
  isUuid: (s: string) => boolean;
  isSpotifyId: (s: string) => boolean;
  /** Resolve a Spotify id to a canonical UUID using only the local catalog (no network). */
  resolveOffline: (spotifyId: string) => Promise<string | null>;
  /** Resolve a Spotify id via a network catalog fetch. May throw. */
  resolveWithNetwork: (spotifyId: string) => Promise<string>;
};

/**
 * Resolve a review's entity_id to a canonical UUID, offline-first.
 *
 * A rating should never hard-fail because Spotify can't be reached: if the user is
 * viewing the entity to rate it, it is already in our catalog and resolves with zero
 * network. Only a genuinely-absent entity falls back to the network, and if that also
 * fails we return `pending` (a retriable signal) instead of a dead 400.
 */
export async function resolveReviewEntityId(
  rawEntityId: string,
  deps: ReviewEntityResolvers,
): Promise<ReviewEntityResolution> {
  if (deps.isUuid(rawEntityId)) return { kind: "resolved", id: rawEntityId };
  // Only Spotify ids need canonicalization; anything else (e.g. lfm:) passes through.
  if (!deps.isSpotifyId(rawEntityId)) return { kind: "resolved", id: rawEntityId };

  const offline = await deps.resolveOffline(rawEntityId);
  if (offline) return { kind: "resolved", id: offline };

  try {
    const networked = await deps.resolveWithNetwork(rawEntityId);
    return { kind: "resolved", id: networked };
  } catch {
    return { kind: "pending" };
  }
}
