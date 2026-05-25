import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiNotFound, apiOk } from "@/lib/api-response";
import { isValidUuid } from "@/lib/validation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getAlbumInfoTabData } from "@/lib/musicbrainz/db-queries";

export const GET = withHandler(async (_request, { params }) => {
  const { id } = params;
  if (!isValidUuid(id)) return apiBadRequest("Invalid album id");

  const supabase = await createSupabaseServerClient();

  const { data: albumMeta } = await supabase
    .from("albums")
    .select("credits_enriched_at, bio, bio_source, release_type")
    .eq("id", id)
    .maybeSingle();

  if (!albumMeta) return apiNotFound("Album not found");

  const infoTabData = await getAlbumInfoTabData(supabase, id);

  return apiOk({
    credits_enriched_at: albumMeta.credits_enriched_at ?? null,
    bio: albumMeta.bio ?? null,
    bio_source: albumMeta.bio_source ?? null,
    release_type: albumMeta.release_type ?? null,
    producers: infoTabData.producers,
    songwriters: infoTabData.songwriters,
    labels: infoTabData.labels,
  });
}, { requireAuth: false });
