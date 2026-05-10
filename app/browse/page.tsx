import type { Metadata } from "next";
import { BrowseGrid } from "./browse-grid";

export const metadata: Metadata = {
  title: "Browse — Tracklist",
  description: "Browse the most played, highest rated, and most favorited albums and tracks.",
};

type Entity = "album" | "track";
type Sort = "popular" | "topRated" | "mostFavorited";
type Era = "all" | "2020s" | "2010s" | "2000s" | "1990s" | "1980s" | "1970s" | "older" | "custom";

function parseEntity(v?: string): Entity {
  return v === "track" ? "track" : "album";
}

function parseSort(v?: string): Sort {
  if (v === "topRated" || v === "mostFavorited") return v;
  return "popular";
}

function parseEra(v?: string): Era {
  const valid: Era[] = ["2020s", "2010s", "2000s", "1990s", "1980s", "1970s", "older", "custom"];
  return (valid as string[]).includes(v ?? "") ? (v as Era) : "all";
}

type Props = {
  searchParams?: Promise<{
    entity?: string;
    sort?: string;
    era?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function BrowsePage({ searchParams }: Props) {
  const sp = searchParams ? await searchParams : {};
  const entity = parseEntity(sp.entity);
  const sort = parseSort(sp.sort);
  const era = parseEra(sp.era);
  const customFrom = sp.from ?? "";
  const customTo = sp.to ?? "";

  return (
    <>
      <BrowseGrid
        initialEntity={entity}
        initialSort={sort}
        initialEra={era}
        initialCustomFrom={customFrom}
        initialCustomTo={customTo}
      />
    </>
  );
}
