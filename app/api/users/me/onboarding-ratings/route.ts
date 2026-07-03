// app/api/users/me/onboarding-ratings/route.ts
import { after } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import {
  persistOnboardingRatings,
  refreshTasteIdentityCacheForUser,
} from "@/lib/taste/taste-identity";

export const POST = withHandler(
  async (request, { user }) => {
    const { data: body, error: parseErr } = await parseBody<{
      ratings?: unknown;
      preferredGenres?: unknown;
    }>(request);
    if (parseErr) return parseErr;

    const rawRatings = body!.ratings;
    if (!Array.isArray(rawRatings)) return apiBadRequest("ratings must be an array");

    const ratings = rawRatings
      .filter(
        (r): r is { albumId: string; rating: number; reviewText?: string } =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as Record<string, unknown>).albumId === "string" &&
          typeof (r as Record<string, unknown>).rating === "number",
      )
      .slice(0, 100);

    const rawGenres = body!.preferredGenres;
    const preferredGenres = Array.isArray(rawGenres)
      ? rawGenres.filter((g): g is string => typeof g === "string").slice(0, 10)
      : [];

    // Fast writes on the hot path so the client's "Continue" returns quickly.
    await persistOnboardingRatings(user!.id, ratings, preferredGenres);

    // Taste-identity computation is expensive (10-15 DB queries + Spotify
    // metadata/image enrichment). Defer it past the response — the onboarding
    // client doesn't consume the result, and cron/first-logs recompute it later.
    const userId = user!.id;
    after(async () => {
      try {
        await refreshTasteIdentityCacheForUser(userId);
      } catch (err) {
        console.error("[onboarding-ratings] deferred taste refresh failed", err);
      }
    });

    return apiOk({ saved: ratings.length });
  },
  { requireAuth: true },
);
