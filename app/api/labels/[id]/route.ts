import { withHandler } from "@/lib/api-handler";
import { apiNotFound, apiOk } from "@/lib/api-response";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const GET = withHandler(async (_req, ctx) => {
  const { id } = ctx.params;
  const supabase = await createSupabaseServerClient();

  const { data: label } = await supabase
    .from("labels")
    .select("id, name, bio, bio_source, country, founded_year, image_url, external_links, mbid")
    .eq("id", id)
    .maybeSingle();

  if (!label) return apiNotFound("Label not found");

  const { data: artistRows } = await supabase
    .from("artist_labels")
    .select("artists(id, name, image_url)")
    .eq("label_id", id)
    .limit(12);

  const { data: albumRows } = await supabase
    .from("album_labels")
    .select("albums(id, name, image_url, release_date)")
    .eq("label_id", id)
    .limit(12);

  return apiOk({
    label,
    topArtists: (artistRows ?? []).map((r) => r.artists),
    topAlbums: (albumRows ?? []).map((r) => r.albums),
  });
}, { requireAuth: false });
