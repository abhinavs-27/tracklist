import { withHandler } from "@/lib/api-handler";
import { apiOk, apiNotFound } from "@/lib/api-response";
import { normalizeReviewEntityId } from "@/lib/validation";
import { getArtistAlbumsWithEngagement } from "@/lib/queries";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { resolveCanonicalArtistUuidFromEntityId } from "@/lib/catalog/entity-resolution";
import type { ArtistAlbumsResponse } from "@/types";

export const GET = withHandler(async (_req, { params }) => {
  const { id: rawId } = params;
  const id = normalizeReviewEntityId(rawId);

  const supabase = await createSupabaseServerClient();
  const canonicalId = await resolveCanonicalArtistUuidFromEntityId(
    supabase,
    id,
  );
  if (!canonicalId) return apiNotFound();

  const { data: artistRow } = await supabase
    .from("artists")
    .select("id, name, image_url")
    .eq("id", canonicalId)
    .maybeSingle();
  if (!artistRow) return apiNotFound();

  const artistName = (artistRow.name as string) ?? id;
  const artistImageUrl = (artistRow.image_url as string | null) ?? null;

  const albums = await getArtistAlbumsWithEngagement(canonicalId);

  return apiOk<ArtistAlbumsResponse>({
    artistName,
    artistImageUrl,
    albums: albums.map((a) => ({
      id: a.id,
      name: a.name,
      artist: artistName,
      artwork_url: a.image_url ?? null,
      listen_count: a.listen_count,
      average_rating: a.average_rating,
    })),
  });
});
