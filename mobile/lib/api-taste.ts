import { fetcher } from "./api";

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
