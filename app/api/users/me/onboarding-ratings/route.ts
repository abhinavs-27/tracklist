// app/api/users/me/onboarding-ratings/route.ts
import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { seedTasteIdentityFromRatings } from "@/lib/taste/taste-identity";

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

    await seedTasteIdentityFromRatings(user!.id, ratings, preferredGenres);

    return apiOk({ saved: ratings.length });
  },
  { requireAuth: true },
);
