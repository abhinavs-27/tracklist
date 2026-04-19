import "server-only";

/** `console.log` each phase of `/album/[id]` so we can see which promise never settles. */
const TAG = "[album-page-load]";

export function albumPagePhaseStart(phase: string, albumId: string): number {
  const t0 = Date.now();
  console.log(TAG, phase, "start", { albumId, t0 });
  return t0;
}

export function albumPagePhaseEnd(
  phase: string,
  albumId: string,
  t0: number,
  extra?: Record<string, unknown>,
): void {
  console.log(TAG, phase, "done", {
    albumId,
    ms: Date.now() - t0,
    ...extra,
  });
}

export function albumPagePhaseError(
  phase: string,
  albumId: string,
  t0: number,
  err: unknown,
): void {
  console.warn(TAG, phase, "error", {
    albumId,
    ms: Date.now() - t0,
    message: err instanceof Error ? err.message : String(err),
  });
}

/**
 * Wrap a promise: logs start, then done/rejected with ms. If the promise never settles,
 * only `start` appears in the server log — that identifies the blocker.
 */
export function withAlbumPagePhaseLog<T>(
  phase: string,
  albumId: string,
  p: Promise<T>,
): Promise<T> {
  const t0 = albumPagePhaseStart(phase, albumId);
  return p.then(
    (v) => {
      albumPagePhaseEnd(phase, albumId, t0);
      return v;
    },
    (e) => {
      albumPagePhaseError(phase, albumId, t0, e);
      throw e;
    },
  );
}
