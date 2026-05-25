import { WebSocket } from "undici";
if (!("WebSocket" in globalThis)) (globalThis as any).WebSocket = WebSocket;

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

async function main() {
  const s = createSupabaseAdminClient();
  const id = "3e71fc5f-f566-40f0-95a9-6015a281ceee";

  const { data: track } = await s.from("tracks").select("id, name, mbid, credits_enriched_at").eq("id", id).single();
  console.log("track:", JSON.stringify(track, null, 2));

  const { data: prod } = await s.from("song_producers").select("artists(id, name)").eq("song_id", id);
  console.log("producers:", JSON.stringify(prod));

  const { data: sw } = await s.from("song_songwriters").select("artists(id, name)").eq("song_id", id);
  console.log("songwriters:", JSON.stringify(sw));

  const { data: feat } = await s.from("track_featuring_artists").select("artists(id, name)").eq("track_id", id);
  console.log("featuring:", JSON.stringify(feat));
}

main().catch(console.error);
