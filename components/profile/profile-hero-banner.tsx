import type { ReactNode } from "react";
import type { FavoriteAlbum } from "@/lib/queries";

export function ProfileHeroBanner({
  albums,
  editButton,
  children,
}: {
  albums: FavoriteAlbum[];
  editButton?: ReactNode;
  children: ReactNode;
}) {
  const bannerImages = albums.filter((a) => a.image_url).slice(0, 4);
  const hasBanner = bannerImages.length > 0;

  const slots = [
    ...bannerImages,
    ...Array.from({ length: Math.max(0, 4 - bannerImages.length) }),
  ] as (FavoriteAlbum | undefined)[];

  return (
    <div>
      <div className="relative h-36 overflow-hidden rounded-2xl sm:h-44" aria-hidden={!editButton}>
        {hasBanner ? (
          <>
            {/* Strip scaled up so edges bleed out — reads as atmosphere, not grid */}
            <div className="absolute inset-0 flex scale-[1.08] gap-0.5" style={{ transformOrigin: "center" }}>
              {slots.map((album, i) =>
                album?.image_url ? (
                  <div key={album.album_id} className="flex-1 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={album.image_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div key={`fill-${i}`} className="flex-1 bg-zinc-800" />
                ),
              )}
            </div>

            {/* Heavier dark overlay so images read as mood not content */}
            <div className="pointer-events-none absolute inset-0 bg-zinc-950/50" />
          </>
        ) : (
          <div className="h-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950">
            <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-gold-500/[0.12] blur-2xl" />
          </div>
        )}

        {/* Bottom fade into page */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-zinc-950 to-transparent" />

        {editButton && (
          <div className="absolute bottom-3 right-3">{editButton}</div>
        )}
      </div>

      <div className="px-1 pb-2">{children}</div>
    </div>
  );
}
