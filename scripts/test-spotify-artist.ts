import { catalogSpotifyFetchJson } from "@/lib/spotify/client";

async function main() {
  try {
    const d = await catalogSpotifyFetchJson<{ name: string }>("/artists/3TVXtAsR1Inumwj472S9r4");
    console.log("OK:", d.name);
  } catch (e) {
    console.error("FAIL:", e instanceof Error ? e.message : String(e));
  }
}
main().catch(console.error);
