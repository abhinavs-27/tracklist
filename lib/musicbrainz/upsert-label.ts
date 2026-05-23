// lib/musicbrainz/upsert-label.ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MbLabel } from "@tracklist/musicbrainz-client";

export async function upsertLabel(
  supabase: SupabaseClient,
  mb: MbLabel,
): Promise<string> {
  const nameNorm = mb.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const foundedYear = mb["life-span"]?.begin
    ? parseInt(mb["life-span"].begin.slice(0, 4), 10) || null
    : null;

  // Try match by MBID first, then normalized name
  const orParts = [`name_normalized.eq.${nameNorm}`];
  if (mb.id) orParts.unshift(`mbid.eq.${mb.id}`);
  const { data: existing } = await supabase
    .from("labels")
    .select("id")
    .or(orParts.join(","))
    .maybeSingle();

  if (existing) {
    const { error: updateErr } = await supabase
      .from("labels")
      .update({ mbid: mb.id, name: mb.name, founded_year: foundedYear, country: mb.country ?? null })
      .eq("id", existing.id);
    if (updateErr) console.warn("[upsert-label] update failed", existing.id, updateErr.message);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("labels")
    .insert({ name: mb.name, mbid: mb.id, founded_year: foundedYear, country: mb.country ?? null })
    .select("id")
    .single();

  if (error) throw new Error(`upsertLabel failed: ${error.message}`);
  return data.id as string;
}
