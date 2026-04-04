import { NextRequest } from "next/server";
import { withHandler } from "@/lib/api-handler";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { LastfmImportEntry } from "@/lib/lastfm/types";
import { insertLastfmImportEntries } from "@/lib/lastfm/import-entries";
import { apiBadRequest, apiInternalError, apiOk } from "@/lib/api-response";
import { parseBody } from "@/lib/api-utils";
import { isValidSpotifyId } from "@/lib/validation";

const MAX_IMPORT = 200;

function isValidIso(s: string): boolean {
  const t = Date.parse(s);
  if (Number.isNaN(t)) return false;
  if (t > Date.now() + 60_000) return false;
  return true;
}

export const POST = withHandler(async (request: NextRequest, { user: me }) => {
  const { data: body, error: parseErr } = await parseBody<{
    entries?: unknown;
  }>(request);
  if (parseErr) return parseErr;

  const raw = body?.entries;
  if (!Array.isArray(raw) || raw.length === 0) {
    return apiBadRequest("entries must be a non-empty array");
  }
  if (raw.length > MAX_IMPORT) {
    return apiBadRequest(`At most ${MAX_IMPORT} listens per import`);
  }

  const entries: LastfmImportEntry[] = [];
  for (const row of raw) {
    if (row == null || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const spotifyTrackId = r.spotifyTrackId;
    const listenedAt = r.listenedAt;
    if (typeof spotifyTrackId !== "string" || !isValidSpotifyId(spotifyTrackId)) {
      return apiBadRequest("Invalid spotifyTrackId in entries");
    }
    if (typeof listenedAt !== "string" || !isValidIso(listenedAt)) {
      return apiBadRequest("Invalid listenedAt in entries");
    }
    if (r.albumId != null && typeof r.albumId !== "string") {
      return apiBadRequest("Invalid albumId");
    }
    if (r.artistId != null && typeof r.artistId !== "string") {
      return apiBadRequest("Invalid artistId");
    }
    if (r.trackName != null && typeof r.trackName !== "string") {
      return apiBadRequest("Invalid trackName");
    }
    if (r.artistName != null && typeof r.artistName !== "string") {
      return apiBadRequest("Invalid artistName");
    }
    if (r.artworkUrl != null && typeof r.artworkUrl !== "string") {
      return apiBadRequest("Invalid artworkUrl");
    }
    const albumId =
      r.albumId !== undefined && r.albumId !== null ? (r.albumId as string) : null;
    const artistId =
      r.artistId !== undefined && r.artistId !== null ? (r.artistId as string) : null;
    if (albumId && !isValidSpotifyId(albumId)) return apiBadRequest("Invalid albumId");
    if (artistId && !isValidSpotifyId(artistId)) return apiBadRequest("Invalid artistId");
    const entry: LastfmImportEntry = {
      spotifyTrackId,
      listenedAt: new Date(listenedAt).toISOString(),
      albumId: albumId ?? null,
      artistId: artistId ?? null,
    };
    if (typeof r.trackName === "string") entry.trackName = r.trackName;
    if (typeof r.artistName === "string") entry.artistName = r.artistName;
    if (r.artworkUrl === null) entry.artworkUrl = null;
    else if (typeof r.artworkUrl === "string") entry.artworkUrl = r.artworkUrl;

    entries.push(entry);
  }

  if (entries.length === 0) {
    return apiBadRequest("No valid entries to import");
  }

  const supabase = await createSupabaseServerClient();

  try {
    const result = await insertLastfmImportEntries(supabase, me!.id, entries);

    if (result.imported === 0) {
      console.log("[lastfm] import-complete", {
        userId: me!.id,
        imported: 0,
        skipped: result.skipped,
      });
      return apiOk({
        imported: 0,
        skipped: result.skipped,
        requested: result.requested,
        message: "Nothing new to import",
        highlights: result.highlights,
      });
    }

    console.log("[lastfm] import-complete", {
      userId: me!.id,
      imported: result.imported,
      skipped: result.skipped,
    });

    return apiOk({
      imported: result.imported,
      skipped: result.skipped,
      requested: result.requested,
      message: `Imported ${result.imported} listens from Last.fm`,
      highlights: result.highlights,
    });
  } catch (insertError) {
    console.error("[lastfm] import insert failed", insertError);
    return apiInternalError(insertError);
  }
}, { requireAuth: true });
