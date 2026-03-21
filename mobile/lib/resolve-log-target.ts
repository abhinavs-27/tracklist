import { fetcher } from "./api";
import {
  resolveTrackForSearchResult as resolveTrackForSearchResultCore,
  type ResolvedLogTarget,
} from "../../lib/logging/resolve-log-target";

export type { ResolvedLogTarget };

export async function resolveTrackForSearchResult(
  kind: "artist" | "album" | "track",
  id: string,
): Promise<ResolvedLogTarget | null> {
  return resolveTrackForSearchResultCore(kind, id, (path) => fetcher(path));
}
