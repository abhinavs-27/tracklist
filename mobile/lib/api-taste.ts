import { fetcher } from "./api";
import type { TasteMatchResponse } from "@repo/types";

export type TasteMatchRow = {
  userId: string;
  similarityScore: number;
  username: string;
  avatar_url: string | null;
  label: string;
};

export type TasteMatchesResponse = {
  matches: TasteMatchRow[];
};

export async function fetchTasteMatches(): Promise<TasteMatchesResponse> {
  return fetcher<TasteMatchesResponse>("/api/taste/matches");
}

export type CommunityTasteMatchResponse = {
  score: number;
  label: string;
  shortLabel: string;
};

export async function fetchCommunityTasteMatch(
  communityId: string,
): Promise<CommunityTasteMatchResponse> {
  return fetcher<CommunityTasteMatchResponse>(
    `/api/communities/${encodeURIComponent(communityId)}/match`,
  );
}

export type { TasteMatchResponse } from "@repo/types";

/** Viewer (Bearer auth) is always user A; compares against `userBId`. */
export async function fetchTasteMatch(
  userBId: string,
): Promise<TasteMatchResponse> {
  return fetcher<TasteMatchResponse>(
    `/api/taste-match?userB=${encodeURIComponent(userBId)}`,
  );
}
