import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getUserRecommendations } from "@/lib/queries";
import { getOrFetchAlbumsBatch } from "@/lib/spotify-cache";
import { AlbumCard } from "@/components/album-card";

export default async function RecommendedPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const raw = await getUserRecommendations(session.user.id, 20);
  const albumIds = raw.map((r) => r.album_id);
  const albumResults =
    albumIds.length > 0 ? await getOrFetchAlbumsBatch(albumIds) : [];
  const albums = albumResults.filter(
    (a): a is NonNullable<typeof a> => a != null,
  );

  return (
    <div className="space-y-6">
      <header>
        <Link href="/discover" className="text-sm text-emerald-400 hover:underline">
          ← Discover
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Recommended for you</h1>
        <p className="mt-1 text-zinc-400">
          Albums loved by people with similar taste
        </p>
      </header>

      {albums.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">
            Log some albums to get personalized recommendations.
          </p>
          <Link href="/search" className="mt-3 inline-block text-emerald-400 hover:underline">
            Search for music
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
        </div>
      )}
    </div>
  );
}
