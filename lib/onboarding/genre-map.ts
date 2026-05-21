// lib/onboarding/genre-map.ts

export type GenreKey =
  | "rock" | "indie" | "pop" | "hip-hop" | "rnb-soul"
  | "electronic" | "jazz" | "classical" | "metal" | "folk"
  | "alternative" | "punk" | "funk" | "reggae" | "latin"
  | "ambient" | "experimental" | "country";

export type Genre = {
  key: GenreKey;
  label: string;
  /** Substrings matched against lowercase artist genre tags */
  tagMatches: string[];
};

export const GENRES: Genre[] = [
  { key: "rock",         label: "Rock",           tagMatches: ["rock"] },
  { key: "indie",        label: "Indie",          tagMatches: ["indie", "chamber pop", "lo-fi"] },
  { key: "pop",          label: "Pop",            tagMatches: ["pop"] },
  { key: "hip-hop",      label: "Hip-Hop",        tagMatches: ["hip hop", "hip-hop", "rap", "trap", "drill"] },
  { key: "rnb-soul",     label: "R&B / Soul",     tagMatches: ["r&b", "soul", "neo soul", "rhythm and blues"] },
  { key: "electronic",   label: "Electronic",     tagMatches: ["electronic", "techno", "house", "edm", "electro", "dance"] },
  { key: "jazz",         label: "Jazz",           tagMatches: ["jazz", "bebop", "fusion", "bossa nova"] },
  { key: "classical",    label: "Classical",      tagMatches: ["classical", "baroque", "orchestral", "opera", "symphony"] },
  { key: "metal",        label: "Metal",          tagMatches: ["metal", "doom", "sludge", "thrash", "black metal", "death metal"] },
  { key: "folk",         label: "Folk",           tagMatches: ["folk", "singer-songwriter", "americana", "bluegrass"] },
  { key: "alternative",  label: "Alternative",    tagMatches: ["alternative", "alt rock", "shoegaze", "noise rock", "post-rock"] },
  { key: "punk",         label: "Punk",           tagMatches: ["punk", "hardcore", "post-punk", "emo"] },
  { key: "funk",         label: "Funk",           tagMatches: ["funk", "groove", "disco"] },
  { key: "reggae",       label: "Reggae",         tagMatches: ["reggae", "dub", "dancehall", "ska"] },
  { key: "latin",        label: "Latin",          tagMatches: ["latin", "salsa", "cumbia", "bossa", "reggaeton"] },
  { key: "ambient",      label: "Ambient",        tagMatches: ["ambient", "drone", "new age", "atmospheric"] },
  { key: "experimental", label: "Experimental",   tagMatches: ["experimental", "avant-garde", "noise", "art rock"] },
  { key: "country",      label: "Country",        tagMatches: ["country", "outlaw country", "country rock"] },
];

export const GENRE_MAP = new Map<GenreKey, Genre>(GENRES.map((g) => [g.key, g]));
