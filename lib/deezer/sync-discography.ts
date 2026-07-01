import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { findAlbumIdByArtistAndName } from "@/lib/catalog/entity-resolution";
import { artistMatches } from "@/lib/lastfm/normalize-lastfm-search";
import {
  getDeezerAlbumTracks,
  getDeezerArtistAlbums,
  searchDeezerArtists,
} from "./client";

const LOG = "[sync-discography]";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_ARTIST_SCORE = 22;

export async function syncArtistDiscography(canonicalArtistId: string): Promise<void> {
  const supabase = createSupabaseAdminClient();

  // Load artist row
  const { data: artist } = await supabase
    .from("artists")
    .select("name, mbid, discography_synced_at")
    .eq("id", canonicalArtistId)
    .maybeSingle();

  if (!artist) return;

  // 7-day skip guard
  if (artist.discography_synced_at) {
    const age = Date.now() - new Date(artist.discography_synced_at as string).getTime();
    if (age < SEVEN_DAYS_MS) return;
  }

  const artistName = artist.name as string;
  const mbid = artist.mbid as string | null;

  // ── Resolve Deezer artist ID ────────────────────────────────────────────────
  let deezerId: number | null = null;

  const { data: extRow } = await supabase
    .from("artist_external_ids")
    .select("external_id")
    .eq("artist_id", canonicalArtistId)
    .eq("source", "deezer")
    .maybeSingle();

  if ((extRow as { external_id?: string } | null)?.external_id) {
    deezerId = Number((extRow as { external_id: string }).external_id);
  } else {
    const candidates = await searchDeezerArtists(artistName, 5);
    for (const c of candidates) {
      const { score } = artistMatches(artistName, [c.name]);
      if (score >= MIN_ARTIST_SCORE) {
        deezerId = c.id;
        await supabase.from("artist_external_ids").upsert(
          { artist_id: canonicalArtistId, source: "deezer", external_id: String(c.id) },
          { onConflict: "artist_id,source" },
        );
        break;
      }
    }
  }

  // ── Deezer primary path ─────────────────────────────────────────────────────
  let albumsFound = 0;
  let albumsInserted = 0;
  let tracksInserted = 0;

  if (deezerId !== null) {
    const allAlbums = await getDeezerArtistAlbums(deezerId);
    const albums = allAlbums.filter(
      (a) => a.record_type === "album" || a.record_type === "ep",
    );
    albumsFound = albums.length;

    for (const dAlbum of albums) {
      try {
        const existingId = await findAlbumIdByArtistAndName(supabase, canonicalArtistId, dAlbum.title);

        if (existingId) {
          // Back-fill missing artwork only
          if (dAlbum.cover_xl) {
            const { data: row } = await supabase
              .from("albums")
              .select("image_url")
              .eq("id", existingId)
              .maybeSingle();
            if (!(row as { image_url?: string } | null)?.image_url) {
              await supabase.from("albums").update({ image_url: dAlbum.cover_xl }).eq("id", existingId);
            }
          }
        } else {
          // Deezer uses "0000-00-00" for unknown release dates
          const releaseDate =
            dAlbum.release_date && dAlbum.release_date !== "0000-00-00"
              ? dAlbum.release_date
              : null;

          const { data: inserted, error: insertErr } = await supabase
            .from("albums")
            .insert({
              name: dAlbum.title,
              artist_id: canonicalArtistId,
              image_url: dAlbum.cover_xl || null,
              release_date: releaseDate,
              total_tracks: dAlbum.nb_tracks || null,
            })
            .select("id")
            .single();

          if (insertErr) {
            console.error(LOG, "album insert failed:", dAlbum.title, insertErr);
          } else {
            const newAlbumId = (inserted as { id?: string } | null)?.id;
            if (newAlbumId) {
              albumsInserted++;
              const tracks = await getDeezerAlbumTracks(dAlbum.id);
              for (const t of tracks) {
                try {
                  await supabase.from("tracks").insert({
                    name: t.title,
                    album_id: newAlbumId,
                    artist_id: canonicalArtistId,
                    track_number: t.trackNumber,
                    disc_number: t.discNumber,
                    duration_ms: null,
                    data_source: "deezer",
                    needs_spotify_enrichment: true,
                  });
                  tracksInserted++;
                } catch (e) {
                  console.error(LOG, "track insert:", t.title, e);
                }
              }
            }
          }
        }
      } catch (e) {
        console.error(LOG, "album error:", dAlbum.title, e);
      }
    }
  }

  // ── MusicBrainz fallback ────────────────────────────────────────────────────
  if (deezerId === null || albumsFound === 0) {
    await syncFromMusicBrainz(supabase, canonicalArtistId, mbid);
  }

  // ── Stamp ──────────────────────────────────────────────────────────────────
  // Stamp regardless of outcome to rate-limit retries on artists with no Deezer/MB presence.
  // A failed resolution doesn't mean the artist was skipped permanently — once the MusicBrainz
  // fallback is implemented (Task 3), it will run and populate albums before this stamp.
  await supabase
    .from("artists")
    .update({ discography_synced_at: new Date().toISOString() })
    .eq("id", canonicalArtistId);

  console.log(LOG, "done", { canonicalArtistId, deezerId, albumsFound, albumsInserted, tracksInserted });
}

// Stub — filled in Task 3
async function syncFromMusicBrainz(
  _supabase: ReturnType<typeof createSupabaseAdminClient>,
  _canonicalArtistId: string,
  _mbid: string | null,
): Promise<void> {
  // intentionally empty until Task 3
}
