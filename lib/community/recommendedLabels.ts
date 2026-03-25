/** Match labels for recommended communities (cosine 0–1). */
export function recommendedFitLabel(score: number): string {
  if (score >= 0.8) return "Perfect fit";
  if (score >= 0.6) return "Great match";
  if (score >= 0.4) return "Good match";
  return "Explore";
}
