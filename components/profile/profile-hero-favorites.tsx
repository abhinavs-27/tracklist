import Link from "next/link";
import type { FavoriteAlbum } from "@/lib/queries";

export function ProfileHeroFavorites({
  albums,
  isOwnProfile,
}: {
  albums: FavoriteAlbum[];
  isOwnProfile: boolean;
}) {
  if (albums.length === 0) {
    if (!isOwnProfile) return null;
    return (
      <div className="mt-5 border-t border-white/[0.07] pt-4">
        <p className="text-xs text-zinc-600">
          No favorite albums set yet — edit your profile to add some.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 border-t border-white/[0.07] pt-4">
      <p className="mb-2.5 text-[11px] font-medium uppercase tracking-widest text-zinc-500">
        Favorites
      </p>
      <div className="flex gap-2">
        {albums.map((album) => (
          <Link
            key={album.album_id}
            href={`/album/${album.album_id}`}
            title={album.name}
            className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-lg ring-1 ring-white/[0.08] transition hover:ring-white/20 sm:h-16 sm:w-16"
          >
            {album.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={album.image_url}
                alt={album.name}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-zinc-600">
                ♪
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
