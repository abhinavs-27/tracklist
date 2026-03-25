/**
 * Cosine similarity for sparse numeric vectors (artist id → weight).
 * Missing keys are treated as 0. Empty vectors → 0.
 */
export function cosineSimilarity(
  vecA: Record<string, number>,
  vecB: Record<string, number>,
): number {
  const keys = new Set([...Object.keys(vecA), ...Object.keys(vecB)]);
  if (keys.size === 0) return 0;

  let dot = 0;
  let na = 0;
  let nb = 0;

  for (const k of keys) {
    const a = vecA[k] ?? 0;
    const b = vecB[k] ?? 0;
    dot += a * b;
    na += a * a;
    nb += b * b;
  }

  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}
