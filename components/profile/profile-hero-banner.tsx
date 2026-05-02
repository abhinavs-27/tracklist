import type { ReactNode } from "react";
import type { FavoriteAlbum } from "@/lib/queries";

export function ProfileHeroBanner({
  albums,
  editButton,
  children,
}: {
  albums: FavoriteAlbum[];
  /** Rendered as an overlay on the banner (own profile only). */
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
    <div className="overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/[0.07]">
      {/* Album banner strip */}
      <div className="relative h-32 sm:h-40" aria-hidden={!editButton}>
        {hasBanner ? (
          <div className="flex h-full">
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
        ) : (
          <div className="h-full bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950">
            <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full bg-emerald-500/[0.12] blur-2xl" />
          </div>
        )}

        {/* Bottom fade so avatar blends naturally into the content */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-zinc-900 to-transparent" />

        {/* Edit button — bottom right of banner */}
        {editButton && (
          <div className="absolute bottom-3 right-3">{editButton}</div>
        )}
      </div>

      {/* Content — z-10 ensures avatar renders on top of the banner */}
      <div className="relative z-10 px-5 pb-5 sm:px-6 sm:pb-6">{children}</div>
    </div>
  );
}
