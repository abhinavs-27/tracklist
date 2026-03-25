/** Step 9: score is 0–1 (cosine similarity). */
export function tasteSimilarityLabel(score: number): string {
  if (score < 0.3) return "Very different";
  if (score < 0.6) return "Some overlap";
  if (score < 0.8) return "Strong match";
  return "Very similar taste";
}

/** Short label for community match card (Step 8). */
export function communityMatchShortLabel(score: number): string {
  if (score >= 0.72) return "Great fit";
  if (score >= 0.45) return "Good match";
  return "Different taste";
}
