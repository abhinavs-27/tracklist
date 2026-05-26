import { withHandler } from "@/lib/api-handler";
import { apiBadRequest, apiNotFound, apiOk } from "@/lib/api-response";
import { isValidSpotifyId, isValidUuid } from "@/lib/validation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { getSongInfoTabData } from "@/lib/musicbrainz/db-queries";

export const GET = withHandler(async (_request, { params }) => {
  const { id } = params;
  if (!isValidSpotifyId(id) && !isValidUuid(id)) return apiBadRequest("Invalid song id");

  const supabase = await createSupabaseServerClient();

  // Resolve UUID — when a Spotify ID is passed, look it up
  let canonicalId = id;
  if (isValidSpotifyId(id) && !isValidUuid(id)) {
    const { data: extId } = await supabase
      .from("track_external_ids")
      .select("track_id")
      .eq("external_id", id)
      .eq("source", "spotify")
      .maybeSingle();
    if (!extId?.track_id) return apiNotFound("Song not found");
    canonicalId = extId.track_id as string;
  }

  const { data: trackMeta } = await supabase
    .from("tracks")
    .select("credits_enriched_at")
    .eq("id", canonicalId)
    .maybeSingle();

  if (!trackMeta) return apiNotFound("Song not found");

  const infoTabData = await getSongInfoTabData(supabase, canonicalId);

  return apiOk({
    credits_enriched_at: trackMeta.credits_enriched_at ?? null,
    producers: infoTabData.producers,
    songwriters: infoTabData.songwriters,
    featuring: infoTabData.featuring,
    samples: infoTabData.samples,
    sampled_by: infoTabData.sampledBy,
    covers: infoTabData.covers,
  });
}, { requireAuth: false });
