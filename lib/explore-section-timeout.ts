/**
 * Per-section timeout for Explore hub: avoid one slow query blocking the whole page.
 * Used by API route fetchers and RSC loaders.
 */
export const EXPLORE_SECTION_TIMEOUT_MS = 2000;

export async function exploreSectionOrFallback<T>(
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(fallback), EXPLORE_SECTION_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([fn(), timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    return result;
  } catch (e) {
    if (timeoutId) clearTimeout(timeoutId);
    throw e;
  }
}
