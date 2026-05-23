import Link from "next/link";

interface SongRef {
  id: string; name: string; artist_name: string; artist_id: string;
  album_image_url: string | null; release_year: number | null;
}

export function SongCard({ song }: { song: SongRef }) {
  return (
    <Link href={`/song/${song.id}`} className="flex items-center gap-2.5 py-2 border-b border-zinc-900 last:border-0 hover:opacity-75 transition-opacity">
      <div className="w-10 h-10 rounded-[6px] bg-zinc-800 flex-shrink-0 overflow-hidden">
        {song.album_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={song.album_image_url} alt="" className="w-full h-full object-cover" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] text-zinc-100 font-medium truncate">{song.name}</p>
        <p className="text-[12px] text-zinc-500 truncate mt-0.5">{song.artist_name}</p>
      </div>
      {song.release_year && (
        <span className="text-[12px] text-zinc-600 flex-shrink-0">{song.release_year}</span>
      )}
    </Link>
  );
}
