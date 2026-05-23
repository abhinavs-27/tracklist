import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type PageParams = Promise<{ id: string }>;

export default async function LabelPage({ params }: { params: PageParams }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: label } = await supabase
    .from("labels")
    .select("id, name, bio, bio_source, country, founded_year, image_url, external_links")
    .eq("id", id)
    .maybeSingle();

  if (!label) notFound();

  const [{ data: artistRows }, { data: albumRows }] = await Promise.all([
    supabase.from("artist_labels").select("artists(id, name, image_url)").eq("label_id", id).limit(12),
    supabase.from("album_labels").select("albums(id, name, image_url, release_date)").eq("label_id", id).limit(12),
  ]);

  const artists = (artistRows ?? []).map((r: any) => ({ id: r.artists.id, name: r.artists.name, image_url: r.artists.image_url }));
  const albums = (albumRows ?? []).map((r: any) => ({ id: r.albums.id, name: r.albums.name, image_url: r.albums.image_url }));

  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Label</p>
        <h1 className="text-3xl font-extrabold text-zinc-100">{label.name as string}</h1>
        {((label.founded_year as number | null) || (label.country as string | null)) && (
          <p className="text-sm text-zinc-500 mt-1">
            {[(label.country as string | null), (label.founded_year as number | null) ? `Est. ${label.founded_year}` : null].filter(Boolean).join(" · ")}
          </p>
        )}
        {(label.bio as string | null) && (
          <p className="text-sm text-zinc-400 leading-relaxed mt-4 max-w-xl">{label.bio as string}</p>
        )}
      </div>

      {artists.length > 0 && (
        <section className="mb-10">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-4">Artists</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {artists.map((a) => (
              <Link key={a.id} href={`/artist/${a.id}`} className="group flex flex-col gap-1.5">
                <div className="aspect-square bg-zinc-800 rounded-lg overflow-hidden">
                  {a.image_url && (
                    <img src={a.image_url} alt={a.name} className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
                  )}
                </div>
                <p className="text-xs text-zinc-400 font-medium truncate">{a.name}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {albums.length > 0 && (
        <section className="mb-10">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-4">Albums</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {albums.map((a) => (
              <Link key={a.id} href={`/album/${a.id}`} className="group flex flex-col gap-1.5">
                <div className="aspect-square bg-zinc-800 rounded-lg overflow-hidden">
                  {a.image_url && (
                    <img src={a.image_url} alt={a.name} className="w-full h-full object-cover group-hover:opacity-80 transition-opacity" />
                  )}
                </div>
                <p className="text-xs text-zinc-400 font-medium truncate">{a.name}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
